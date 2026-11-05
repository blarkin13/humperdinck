"""Non-destructive refinements for generated speech from uploaded reference voices.

The original uploaded reference WAV is never modified. Changes are applied to
the synthesized output using local FFmpeg effects. Text descriptions are
notes/guidance; cloning engines do not necessarily obey free-form prompts.
"""
from __future__ import annotations
import math
import subprocess
from pathlib import Path

DEFAULTS={'pitch':50,'pace':50,'rasp':50,'warmth':50}
LIMITS={'pitch':(0,100),'pace':(0,100),'rasp':(0,100),'warmth':(0,100)}

def normalize_refinement(value):
    if not isinstance(value,dict):
        raise ValueError('Voice refinement must be an object')
    settings=value.get('sliders',DEFAULTS)
    if not isinstance(settings,dict) or any(k not in LIMITS for k in settings):
        raise ValueError('Unsupported voice refinement slider')
    if any(type(v) is not int or not 0<=v<=100 for v in settings.values()):
        raise ValueError('Slider values must be integers from 0 to 100')
    prompt=value.get('description','')
    if not isinstance(prompt,str) or len(prompt)>1200:
        raise ValueError('Description must contain at most 1200 characters')
    return {'sliders':{**DEFAULTS,**settings},'description':prompt.strip()}

def is_neutral(value):
    return all(value['sliders'][k]==v for k,v in DEFAULTS.items())

def filter_chain(value):
    """FFmpeg post-processing adjustments with deliberately conservative ranges."""
    settings=normalize_refinement(value)['sliders']
    pitch=2**(((settings['pitch']-50)/50*2.5)/12)
    pace=1+(settings['pace']-50)/50*.20
    # asetrate changes pitch; atempo compensates for pitch-induced time scaling.
    filters=[]
    if settings['pitch']!=50 or settings['pace']!=50:
        filters.extend([f'asetrate={round(24000*pitch)}','aresample=24000',
                        f'atempo={pace/pitch:.5f}'])
    warmth=(settings['warmth']-50)/50*4
    if abs(warmth)>.02:
        filters.append(f'equalizer=f=250:t=h:width=200:g={warmth:.2f}')
    # Slight presence EQ changes timbre; cannot create genuine vocal rasp.
    texture=(settings['rasp']-50)/50*3
    if abs(texture)>.02:
        filters.append(f'equalizer=f=2500:t=h:width=1600:g={texture:.2f}')
    return ','.join(filters)

def refine_wav(path:Path,value):
    """Replace generated WAV atomically only after a successful filter process."""
    normalized=normalize_refinement(value)
    chain=filter_chain(normalized)
    if not chain:return
    output=path.with_name(path.stem+'-refined.wav')
    try:
        subprocess.run(['ffmpeg','-nostdin','-hide_banner','-loglevel','error',
                        '-y','-i',str(path),'-vn','-af',chain,
                        '-ac','1','-ar','24000',str(output)],
                       check=True,timeout=180,capture_output=True)
        if not output.exists() or output.stat().st_size==0:
            raise ValueError('Refinement produced no audio')
        output.replace(path)
    except (subprocess.CalledProcessError,subprocess.TimeoutExpired) as exc:
        raise ValueError('Could not process the adjusted voice') from exc
    finally:
        output.unlink(missing_ok=True)

def suggest_sliders(text,current=None):
    """Conservative local mapping from plain-language guidance to slider changes."""
    settings=normalize_refinement(current or {})['sliders'].copy()
    description=text.lower()
    for words,field,value in [
        (('deep','deeper','lower pitched'), 'pitch',35),
        (('high pitched','higher pitch','bright pitch'), 'pitch',65),
        (('slower','slowly','deliberate pace'), 'pace',35),
        (('fast','faster','quickly'), 'pace',65),
        (('warm','warmer','rounded'), 'warmth',65),
        (('thin','crisp','less warmth'), 'warmth',35),
        (('gravelly','raspy','rough'), 'rasp',65),
        (('smooth','soft spoken','less rasp'), 'rasp',35),
    ]:
        if any(word in description for word in words):settings[field]=value
    return settings
