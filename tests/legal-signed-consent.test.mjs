import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const load=path=>readFileSync(new URL('../website/'+path+'/index.html',import.meta.url),'utf8');

test('license prominently requires prior signed speaker authorization before cloning',()=>{
 const html=load('license');
 const h=html.indexOf('id="consent-warning-title"');
 const section=html.indexOf('<div class="legal-columns">');
 assert.ok(h>=0&&h<section,'Mandatory consent notice precedes license sections');
 assert.match(html,/prior, express, written and signed authorization/);
 assert.match(html,/public figures, celebrities, neighbors, friends, family members/);
 assert.match(html,/handwritten signature or legally effective electronic signature/);
 assert.match(html,/a generic website license, a purchased recording, a social-media clip or an ordinary checkbox/);
 assert.match(html,/id="license-indemnification"/);
 assert.match(html,/defend, indemnify and hold harmless/);
 assert.match(html,/id="license-liability"/);
 assert.match(html,/Humperdinck disclaims responsibility/);
 assert.match(html,/Nothing in this agreement removes liability for Humperdinck's own wrongful conduct/);
 const indexes=[...html.matchAll(/<section class="legal-section"[^>]*><div class="legal-section-index">(\d{2})/g)]
  .map(x=>Number(x[1]));
 assert.deepEqual(indexes,Array.from({length:13},(_,i)=>i+1));
});

test('voice consent, site terms and mobile legal warning are consistent',()=>{
 const voice=load('voice-policy'),terms=load('terms');
 const css=readFileSync(new URL('../website/legal.css',import.meta.url),'utf8');
 assert.match(voice,/signed written consent/i);
 assert.match(voice,/prior, express, written consent/);
 assert.match(voice,/\/license\/#license-indemnification/);
 assert.match(terms,/prior express written and <strong>signed<\/strong> consent/);
 assert.match(terms,/\/license\/#license-indemnification/);
 assert.match(css,/\.legal-consent-warning\{/);
 assert.match(css,/@media\(max-width:720px\)/);
});
