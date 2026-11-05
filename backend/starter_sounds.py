"""Original procedural nature audio for Humperdinck's starter library.

No third-party field recordings or Pixabay assets are bundled or downloaded.
All clips are synthesized using deterministic noise, tone and amplitude models.
They are illustrative sound designs, not real wildlife/location recordings.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from uuid import uuid5, NAMESPACE_URL
import numpy as np
import soundfile as sf

RATE=24000

# name, category, tags, algorithm, duration seconds, seed
STARTERS=[
 ('Gentle Rain','Rain','rain drizzle gentle soft', 'rain',8,1),
 ('Heavy Rain','Rain','rain downpour heavy', 'rain',8,2),
 ('Rain on Leaves','Rain','rain leaves forest droplets', 'leaves',8,3),
 ('Rain on a Window','Rain','rain window droplets patter', 'patter',7,4),
 ('Distant Rainstorm','Rain','rain storm distant weather', 'storm',9,5),
 ('Distant Thunder','Weather','thunder rumble storm', 'thunder',9,6),
 ('Rolling Thunder','Weather','rolling rumble thunder', 'thunder',9,7),
 ('Wind and Rain','Weather','wind rain storm', 'windrain',8,8),
 ('Soft Mountain Breeze','Wind','wind gentle mountain air', 'wind',8,9),
 ('Strong Gusting Wind','Wind','wind gust strong', 'wind',8,10),
 ('Wind Through Pines','Wind','pine trees forest wind', 'pines',8,11),
 ('Wind Through Tall Grass','Wind','grass field rustling breeze', 'grass',8,12),
 ('Ocean Waves','Water','sea ocean waves surf beach', 'surf',9,13),
 ('Gentle Shoreline','Water','shore gentle water beach', 'shore',9,14),
 ('Rocky Coast','Water','rocks waves crashing shore', 'coast',9,15),
 ('River Stream','Water','river stream water flowing', 'stream',9,16),
 ('Forest Creek','Water','creek brook babbling water', 'creek',9,17),
 ('Water Dripping','Water','droplets dripping cave drops', 'drips',7,18),
 ('Forest Morning','Forest','woods dawn birds forest', 'forest',10,19),
 ('Forest Afternoon','Forest','forest trees birds wind', 'forest',10,20),
 ('Woodland Birds','Birds','chirping birds woodland song', 'birds',9,21),
 ('Dawn Birdsong','Birds','dawn morning songbird', 'dawn',9,22),
 ('Single Bird Calls','Birds','bird chirping calls', 'singlebird',8,23),
 ('Distant Owl','Birds','owl nighttime hooting', 'owl',8,24),
 ('Night Crickets','Insects','night crickets chirps', 'crickets',9,25),
 ('Summer Cicadas','Insects','cicadas summer buzzing', 'cicadas',9,26),
 ('Night Meadow','Insects','night meadow insects', 'meadow',9,27),
 ('Frogs at the Pond','Wildlife','frogs pond croaking', 'frogs',9,28),
 ('Bee Buzzing','Insects','bees buzzing pollinator', 'bee',7,29),
 ('Campfire Crackle','Nature','fire flames wood crackle', 'fire',9,30),
]

def _colored(n,rng,power=1.0):
    # FFT-shaped noise, RMS normalization, no external signal-processing dependency.
    freqs=np.fft.rfftfreq(n,1/RATE)
    spectrum=np.fft.rfft(rng.standard_normal(n).astype(np.float32))
    spectrum*=np.maximum(freqs,5)**(-power/2)
    out=np.fft.irfft(spectrum,n).astype(np.float32)
    out-=out.mean()
    return out/(np.std(out)+1e-7)

def _pulse(t,at,width,decay=1.0):
    x=(t-at)/max(width,1e-3)
    return np.exp(-np.maximum(x,0)*decay)*np.where(x>=0,1.0,0.0)

def _bird(t,start,freq,duration,amp=.18):
    phase=(t-start)
    mask=(phase>=0)&(phase<duration)
    x=np.maximum(phase,0)
    envelope=np.sin(np.pi*np.clip(x/duration,0,1))**1.4
    instantaneous=freq*(1+.12*np.sin(2*np.pi*5*x)+.08*np.sin(2*np.pi*2*x))
    # Integrating varying frequency is unnecessary for stylized calls;
    # phase modulation preserves the rise/fall contour.
    return (amp*mask*envelope*np.sin(2*np.pi*instantaneous*x)).astype(np.float32)

def synthesize(kind,duration,seed):
    rng=np.random.default_rng(seed)
    n=int(RATE*duration)
    t=np.arange(n,dtype=np.float32)/RATE
    white=rng.standard_normal(n).astype(np.float32)
    low=_colored(n,rng,1.7)
    mid=_colored(n,rng,.75)
    air=_colored(n,rng,.25)
    slow=(np.sin(2*np.pi*(.13+.013*seed)*t)+1)*.5
    bed=(.36*mid+.15*low+.10*white).astype(np.float32)
    if kind in ('rain','leaves','patter','storm','windrain'):
        k={'rain':(.32,.15),'leaves':(.18,.27),'patter':(.22,.35),
           'storm':(.35,.3),'windrain':(.32,.35)}[kind]
        out=k[0]*air+k[1]*low*(.5+slow)
        for _ in range(220 if kind=='patter' else 135):
            at=float(rng.uniform(0,duration))
            ix=int(at*RATE)
            length=min(n-ix,int(RATE*.032))
            if length>0:
                click=rng.standard_normal(length).astype(np.float32)*np.exp(-np.arange(length)/(RATE*.006))
                out[ix:ix+length]+=click*rng.uniform(.03,.18)
        if kind in ('storm','windrain'):
            out+=.23*low*(.2+.8*slow)
    elif kind in ('thunder',):
        onset=duration*.18
        swell=np.exp(-np.maximum(t-onset,0)/2.8)*(t>=onset)
        out=(.5*low+.12*mid)*swell+.08*low
    elif kind in ('wind','pines','grass'):
        level=.10+.25*(slow**2)
        out=(.75*low+.25*mid)*level
        if kind=='pines':out+=.07*air*(.2+slow)
        if kind=='grass':out+=.11*air*(.3+slow)
    elif kind in ('surf','shore','coast'):
        wave=(np.sin(2*np.pi*(.15 if kind=='shore' else .20)*t)**8)
        wash=np.clip(wave*.5+.55,0,1)
        out=(.34*air+.1*low)*wash
        if kind=='coast':out+=.15*mid*wash
    elif kind in ('stream','creek','drips'):
        out=(.28*air+.16*mid)*(.8+.2*slow)
        for _ in range(35 if kind=='drips' else 150):
            at=float(rng.uniform(0,duration))
            f=float(rng.uniform(230,950))
            width=float(rng.uniform(.025,.11))
            x=t-at
            out+=(.055 if kind!='drips' else .11)*np.sin(2*np.pi*f*np.maximum(x,0))*np.exp(-np.maximum(x,0)/width)*(x>=0)
        if kind=='drips':out*=.5
    elif kind in ('forest','birds','dawn','singlebird','owl'):
        out=.09*mid+.09*low
        count=15 if kind=='singlebird' else 32
        if kind=='owl':count=7
        for _ in range(count):
            at=float(rng.uniform(0,duration))
            freq=float(rng.uniform(280,550) if kind=='owl' else rng.uniform(1300,4200))
            width=float(rng.uniform(.13,.38) if kind!='owl' else rng.uniform(.3,.7))
            out+=_bird(t,at,freq,width,.10 if kind=='owl' else .07)
    elif kind in ('crickets','cicadas','meadow'):
        out=.065*low
        f={'crickets':4100,'cicadas':2300,'meadow':3700}[kind]
        chirps=(np.sin(2*np.pi*(7 if kind=='crickets' else 11)*t)>.5).astype(np.float32)
        out+=.15*chirps*np.sin(2*np.pi*f*t)*(0.5+.5*slow)
        out+=.025*air
    elif kind=='frogs':
        out=.07*low+.04*mid
        for _ in range(22):
            at=float(rng.uniform(0,duration))
            x=t-at;mask=(x>=0)&(x<.28)
            out+=.16*mask*np.sin(2*np.pi*(160+25*np.sin(2*np.pi*7*np.maximum(x,0)))*np.maximum(x,0))*np.sin(np.pi*np.clip(x/.28,0,1))
    elif kind=='bee':
        out=.03*air+.16*np.sin(2*np.pi*(210+35*np.sin(2*np.pi*1.2*t))*t)*(.4+.6*slow)
    elif kind=='fire':
        out=.06*low+.08*mid
        for _ in range(190):
            at=float(rng.uniform(0,duration));ix=int(at*RATE)
            length=min(n-ix,int(RATE*.014))
            if length:
                env=np.exp(-np.arange(length,dtype=np.float32)/(RATE*.0025))
                out[ix:ix+length]+=rng.uniform(.05,.4)*env*rng.standard_normal(length)
    else:
        out=bed
    out=np.nan_to_num(out).astype(np.float32)
    out-=float(out.mean())
    peak=float(np.max(np.abs(out)))+1e-8
    out*=min(.80/peak,1.3)
    # Brief edges avoid clicks; intentionally no loudness normalization.
    edge=min(int(.06*RATE),n//2)
    if edge:
        out[:edge]*=np.linspace(0,1,edge,dtype=np.float32)
        out[-edge:]*=np.linspace(1,0,edge,dtype=np.float32)
    return out

def seed_catalog(folder:Path,catalog:dict):
    """Populate once; caller owns the sentinel and catalog write."""
    import datetime
    for name,category,tags,kind,duration,seed in STARTERS:
        identifier=uuid5(NAMESPACE_URL,'humperdinck:original-nature-v1:'+str(seed)).hex
        path=folder/(identifier+'.wav')
        if not path.exists():
            audio=synthesize(kind,duration,seed)
            sf.write(str(path),audio,RATE,subtype='PCM_16')
        catalog[identifier]={
            'id':identifier,'name':name,'category':category,'tags':tags.split(),
            'duration':float(duration),'created_at':'2026-11-05T00:00:00Z',
            'origin':'starter','license':'Humperdinck original procedural audio',
            'favorite':False,
        }
    return catalog
