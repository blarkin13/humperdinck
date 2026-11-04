'use strict';
// The first public website is intentionally static. No account forms or API calls
// are presented until authentication and hosted demo services actually exist.
const year = document.getElementById('year');
if (year) year.textContent = String(new Date().getFullYear());
