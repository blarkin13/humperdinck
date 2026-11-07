# Built-In Humperdinck Voices

The voices every install receives. You can add, change or remove them at any time, without a new app release.

## Managing them (your Mac only)

1. Run the developer copy: `python scripts/start.py`. The installed app never shows this section.
2. Open **Voice Library → Built-In Humperdinck Voices**.
3. **Add a voice:** pick one of your voices, click **Generate sample**, listen, then click **Add to pack**.
4. **Remove a voice:** click **Remove** next to it.
5. **Change a voice:** remove it, edit the voice, then add it again.
6. Click **Publish to everyone**.

Publishing uses your GitHub CLI sign-in (`gh auth login`). It uploads `pack.zip` and `latest.json` to the `voices` prerelease in `blarkin13/humperdinck-downloads`. No credentials ship inside the app.

## What people see

When the installed app starts, it checks `https://humperdinck.larki-brian.workers.dev/voices/latest.json`. If you published something newer, it downloads the pack and then:

- adds new voices
- replaces the sample and name of voices you changed
- removes voices you took out of the pack

Personal voices are never touched. If someone deletes a built-in voice themselves, it stays deleted. Allow about 5 minutes for the website cache after publishing.

If the computer is offline, the app keeps the voices it already has. Brand-new installs start with the voices bundled in the installer, then pick up your latest pack on first launch.

## Voice gallery (optional voices)

Each voice in the publisher has a **Built-in / Gallery** choice:

- **Built-in:** every install gets it automatically (described above).
- **Gallery:** it's listed at `https://humperdinck.larki-brian.workers.dev/gallery/` and in the app under **Voice Library → Browse the voice gallery**. People download the ones they want.

Publishing uploads one `catalog-<id>.wav` per gallery voice plus `catalog.json` to the same `voices` release, and deletes files for voices that left the gallery.

Downloaded gallery voices update when you change them. If you take a voice out of the gallery, people who already downloaded it keep it. Moving a voice from Built-in to Gallery removes it from installs that didn't download it, like any built-in removal.

At least one voice must stay Built-in.
