import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// friendlyError lives in src.jsx (JSX); pull the function out to test it alone.
const source=readFileSync(new URL('../src.jsx',import.meta.url),'utf8');
const body=source.slice(source.indexOf('export function friendlyError'),source.indexOf('\nasync function api('));
const friendlyError=new Function(body.replace('export function','return function'))();

test('network failures become a plain retry hint',()=>{
 for(const raw of ['Failed to fetch','NetworkError when attempting to fetch resource.','Load failed'])
  assert.match(friendlyError(raw),/Can't reach Humperdinck's audio engine/);
});
test('Python exception names are removed, the explanation kept',()=>{
 assert.equal(friendlyError('RuntimeError: Model is still downloading'),'Model is still downloading');
 assert.equal(friendlyError('FileNotFoundError: voice.wav'),'voice.wav');
});
test('ordinary messages pass through and empty ones get a fallback',()=>{
 assert.equal(friendlyError('FFmpeg is required'),'FFmpeg is required');
 assert.equal(friendlyError(''),'Something went wrong. Please try again.');
});
