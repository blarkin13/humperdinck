"""Offline narration sound mixing: fades, looping beds and voice ducking."""
from __future__ import annotations

import numpy as np


def fade_clip(audio, sample_rate: int, fade_in: float = 0, fade_out: float = 0):
    """Return a copy, with bounded linear fades; works on mono float32 arrays."""
    result=np.asarray(audio,dtype=np.float32).copy()
    n=len(result)
    if not n:return result
    for seconds,at_start in ((fade_in,True),(fade_out,False)):
        count=min(n,round(max(0.0,float(seconds))*sample_rate))
        if not count:continue
        # Include exact endpoints when possible; avoid a division by zero for one sample.
        shape=np.linspace(0,1,count,dtype=np.float32) if count>1 else np.array([0],dtype=np.float32)
        if at_start:result[:count]*=shape
        else:result[-count:]*=shape[::-1]
    return result


def loop_to_duration(audio, length: int):
    """Repeat the complete effect file to fill a soundtrack, trimming at the end."""
    source=np.asarray(audio,dtype=np.float32)
    if length<=0:return np.empty(0,dtype=np.float32)
    if not len(source):raise ValueError('Cannot loop an empty sound effect')
    count=(length+len(source)-1)//len(source)
    return np.tile(source,count)[:length].copy()


def mix_ambience(base, ambience, speech_mask, *, sample_rate=24000,
                 volume=0.25, ducking=0.35, fade_in=0.5, fade_out=0.5):
    """Overlay looping background sound; lower ambience under spoken words.

    speech_mask marks actual narration samples, excluding cues and inter-section gaps.
    The duck envelope glides instead of toggling sharply, preventing audible clicks.
    """
    foreground=np.asarray(base,dtype=np.float32)
    mask=np.asarray(speech_mask,dtype=bool)
    if len(foreground)!=len(mask):raise ValueError('Speech mask must match narration')
    if not len(foreground):return foreground.copy()
    if not (0<=volume<=1.5 and 0<=ducking<=1):raise ValueError('Invalid mix levels')
    bed=loop_to_duration(ambience,len(foreground))
    bed=fade_clip(bed,sample_rate,fade_in,fade_out)
    target=np.where(mask,ducking,1.0).astype(np.float32)
    # 35ms attack/release smoothing with a deterministic ramp; cap for large renders.
    ramp=max(1,round(sample_rate*.035))
    envelope=target.copy()
    if ramp>1:
        # A one-pole filter gives smooth boundaries with constant time/memory overhead.
        alpha=1.0/ramp
        gain=float(target[0])
        for i in range(len(target)):
            gain+=alpha*(float(target[i])-gain)
            envelope[i]=gain
    return np.clip(foreground+bed*volume*envelope,-1,1).astype(np.float32)


def assemble_narration(sections, ambience=None, *, sample_rate=24000,
                       ambience_volume=0.25, ducking=0.35,
                       fade_in=0.5, fade_out=0.5):
    """Sections contain (before-effects, voice, after-effects, silence).

    Effects are float32 mono arrays. Each section voice is specifically masked
    for ducking; effect audio and deliberate silence do not count as speech.
    """
    clips=[]
    masks=[]
    for before,voice,after,silence in sections:
        for sound in before:
            clips.append(sound);masks.append(np.zeros(len(sound),dtype=bool))
        clips.append(voice);masks.append(np.ones(len(voice),dtype=bool))
        for sound in after:
            clips.append(sound);masks.append(np.zeros(len(sound),dtype=bool))
        if silence>0:
            clips.append(np.zeros(silence,dtype=np.float32))
            masks.append(np.zeros(silence,dtype=bool))
    if not clips:raise ValueError('Narration has no audio')
    combined=np.concatenate(clips).astype(np.float32)
    if ambience is None:return combined
    spoken=np.concatenate(masks)
    return mix_ambience(combined,ambience,spoken,sample_rate=sample_rate,
                        volume=ambience_volume,ducking=ducking,
                        fade_in=fade_in,fade_out=fade_out)
