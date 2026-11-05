"""Hand-verified CC0 nature recordings (source metadata, not synthetic audio).

Freesound original downloads require the user to log into Freesound. Only
Wikimedia Commons Swale.ogg has a public, checksum-verified direct URL.
"""
from __future__ import annotations

SOUNDS=[
 {'slug':'rain-leaves','name':'Rain on Leaves','category':'Rain','creator':'SamsterBirdies','duration':49.927,'source_url':'https://freesound.org/people/SamsterBirdies/sounds/584272/','filename':'584272','provider':'Freesound'},
 {'slug':'thunderstorm','name':'Thunderstorm','category':'Weather','creator':'laribum','duration':77.0,'source_url':'https://freesound.org/people/laribum/sounds/353025/','filename':'353025','provider':'Freesound'},
 {'slug':'atlantic-ocean','name':'Atlantic Ocean Waves','category':'Water','creator':'INNORECORDS','duration':120.935,'source_url':'https://freesound.org/people/INNORECORDS/sounds/457740/','filename':'457740','provider':'Freesound'},
 {'slug':'river-creek','name':'River and Creek','category':'Water','creator':'kentspublicdomain','duration':30.551,'source_url':'https://freesound.org/people/kentspublicdomain/sounds/325182/','filename':'325182','provider':'Freesound'},
 {'slug':'forest-birds','name':'Forest Birds — Seamless Loop','category':'Birds','creator':'Magnesus','duration':27.051,'source_url':'https://freesound.org/people/Magnesus/sounds/723913/','filename':'723913','provider':'Freesound'},
 {'slug':'hilltop-wind','name':'Wind Over Holehead Hill','category':'Wind','creator':'Sandy-Ogilvie','duration':200.493,'source_url':'https://freesound.org/people/Sandy-Ogilvie/sounds/847257/','filename':'847257','provider':'Freesound'},
 {'slug':'night-crickets','name':'Southern Summer Evening Crickets','category':'Insects','creator':'RyanKingArt','duration':45.046,'source_url':'https://freesound.org/people/RyanKingArt/sounds/746366/','filename':'746366','provider':'Freesound'},
 {'slug':'frog-pond','name':'Frogs at a Pond','category':'Wildlife','creator':'Hrothmeir','duration':284.906,'source_url':'https://freesound.org/people/Hrothmeir/sounds/850667/','filename':'850667','provider':'Freesound'},
 {'slug':'campfire','name':'Campfire Crackling','category':'Nature','creator':'Defaultv','duration':24.729,'source_url':'https://freesound.org/people/Defaultv/sounds/536935/','filename':'536935','provider':'Freesound'},
 {'slug':'trickling-water','name':'Trickling Water','category':'Water','creator':'Ksd5','duration':31.028,'source_url':'https://commons.wikimedia.org/wiki/File:Swale.ogg','filename':'Swale.ogg','provider':'Wikimedia Commons',
  'download_url':'https://upload.wikimedia.org/wikipedia/commons/8/84/Swale.ogg',
  'sha1':'4f97748c715d90fda6357073f14a12e68f294d73'},
]
BY_SLUG={entry['slug']:entry for entry in SOUNDS}

def public_catalog(local):
    by_slug={entry.get('curated_slug'):entry for entry in local}
    return [{**entry,'license':'CC0 1.0','installed':entry['slug'] in by_slug,
             'installed_id':by_slug.get(entry['slug'],{}).get('id'),
             'download_method':'direct' if 'download_url' in entry else 'login_then_import'}
            for entry in SOUNDS]

def source_metadata(entry):
    return {k:entry[k] for k in ('slug','name','creator','category','source_url','provider')}
