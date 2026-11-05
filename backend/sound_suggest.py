"""Private, optional local Ollama sound-effect recommendations.

The assistant is limited to selecting IDs from the user's existing sound library.
No sound insertion, file access, cloud calls or model downloads occur here.
"""
from __future__ import annotations

import json
import re
from urllib.request import Request, urlopen
from urllib.error import URLError

OLLAMA='http://127.0.0.1:11434'
DEFAULT_TIMEOUT=12

HINTS={
 'thunder':('storm','thunder','lightning','rumble'),
 'rain':('rain','drizzle','downpour'),
 'ocean':('ocean','sea','ship','boat','sail','harbor','shore'),
 'footstep':('footsteps','boots','walked','running','ran','steps'),
 'door':('door','knocking','knock','slam','creak'),
 'wind':('wind','breeze','gust'),
 'fire':('fire','flames','burning','crackle'),
 'battle':('sword','battle','blade','clash','fight'),
 'bird':('bird','forest','woods','jungle'),
 'crowd':('crowd','cheers','applause','audience'),
 'clock':('clock','ticking','midnight'),
 'scream':('scream','shouted','cry'),
}

def keyword_suggestions(text,library,limit=3):
    narration=str(text or '').lower()
    results=[]
    for tag,words in HINTS.items():
        if not any(re.search(r'\b'+re.escape(w)+r'\b',narration) for w in words):
            continue
        for entry in library:
            title=(entry.get('name','')+' '+entry.get('category','')).lower()
            if any(key in title for key in (tag,*words)):
                if entry['id'] not in {item['sound_id'] for item in results}:
                    results.append({'sound_id':entry['id'],'reason':'Matches '+tag,'source':'keywords'})
                break
        if len(results)>=limit:break
    return results

def _get_json(url,body=None,timeout=DEFAULT_TIMEOUT):
    data=None if body is None else json.dumps(body).encode('utf-8')
    request=Request(url,data=data,headers={'Content-Type':'application/json'})
    with urlopen(request,timeout=timeout) as response:
        return json.loads(response.read(256*1024))

def ollama_suggestions(text,library,limit=3):
    """Best-effort local AI lookup; return None when no local model is available."""
    try:
        models=_get_json(OLLAMA+'/api/tags',timeout=2).get('models',[])
        names=[m.get('name','') for m in models if m.get('name')]
        if not names:return None
        # Prefer a smaller instruction model, but never trigger a model download.
        preferred=('qwen3:4b','qwen2.5:3b','llama3.2:3b','gemma3:4b')
        model=next((name for choice in preferred for name in names if name.startswith(choice)),names[0])
        allowed=[{'id':s['id'],'name':s.get('name',''),'category':s.get('category','')} for s in library[:150]]
        prompt=(
            'You recommend sound effects for a narration. Choose at most '+str(limit)+
            ' matching IDs ONLY from the provided sound catalog. Never invent sounds. '
            'Return JSON object {"suggestions":[{"sound_id":"...","reason":"brief reason"}]}. '
            'If none fit, return an empty list. Narration: '+json.dumps(text[:5000])+
            '\nAvailable sounds: '+json.dumps(allowed)
        )
        result=_get_json(OLLAMA+'/api/generate',{
            'model':model,'prompt':prompt,'format':'json','stream':False,
            'options':{'temperature':0.2,'num_predict':240}
        },timeout=DEFAULT_TIMEOUT)
        parsed=json.loads(result.get('response','{}'))
        allowed_ids={item['id'] for item in allowed}
        selected=[];seen=set()
        for entry in parsed.get('suggestions',[]):
            sid=entry.get('sound_id')
            if sid not in allowed_ids or sid in seen:continue
            seen.add(sid)
            selected.append({'sound_id':sid,'reason':str(entry.get('reason','Matched narration'))[:120],
                             'source':'ollama'})
            if len(selected)>=limit:break
        return selected
    except (URLError,OSError,TimeoutError,ValueError,KeyError,TypeError,AttributeError):
        return None

def recommend(text,library,limit=3):
    ai=ollama_suggestions(text,library,limit)
    return {'source':'ollama','suggestions':ai} if ai is not None else {
        'source':'keywords','suggestions':keyword_suggestions(text,library,limit)}
