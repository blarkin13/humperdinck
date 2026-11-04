'use strict';
// Static website: actual Kokoro samples use browser-native audio elements.
// Account forms and hosted custom text-to-speech remain unavailable.
const year = document.getElementById('year');
if (year) year.textContent = String(new Date().getFullYear());
