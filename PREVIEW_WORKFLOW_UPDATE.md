# Voice Designer: preview before saving

## New workflow
1. Open **Voice Library**, choose **+ New voice** or select an existing designed voice.
2. Enter the description and characteristics.
3. Enter a short sample (up to 600 characters), then select **Generate preview**.
4. Listen to the audio player. Select **Generate preview** again for another candidate.
5. Select the preferred candidate and click **Approve selected voice & save**. A new voice or version is created as needed and the chosen audio is saved as its approved reference.
6. In **Audio Studio**, select **Reuse approved designed voice (Chatterbox)** and the saved voice.

**Save draft without approval** stores a recipe without requiring audio generation. Previous approved versions remain available in version history.

## Important limitations
- Qwen MLX and Chatterbox must already be installed in the user's environment. No new ML dependencies are introduced.
- Unsaved preview audio is temporarily kept under `data/outputs`; preview candidates shown in the browser are session-only. Approved previews are copied to the persistent `data/designed_voice_samples` directory.
- A server restart clears in-memory preview job records. Approve the desired preview before restarting the server.
- Identity reuse requires Chatterbox and is not guaranteed to perfectly preserve the voice.
- No model audio quality tests were run in the build environment; API flow was tested with a stub generator.
