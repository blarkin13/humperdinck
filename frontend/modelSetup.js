// Shared installation orchestration for Setup Wizard and Models.
// The backend permits one installation job at a time.
export async function modelRequest(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw Error(data.detail || data.message || 'Model request failed');
  return data;
}
export const getModels = () => modelRequest('/api/models', {cache:'no-store'});
export const installerPost = (engine, model) => modelRequest('/api/models/install', {
  method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({engine,model:model || null})
});
export async function waitForInstall(job, onProgress) {
  let current = job;
  while (current.status === 'queued' || current.status === 'running') {
    await new Promise(resolve => setTimeout(resolve, 1250));
    current = await modelRequest('/api/jobs/' + current.job_id);
    onProgress?.(current);
  }
  if (current.status !== 'complete') throw Error(current.message || 'Installation failed');
  return current;
}
export async function runModelSteps(steps, onProgress) {
  for (let i=0;i<steps.length;i++) {
    const step=steps[i];
    const data=await getModels();
    const engine=data.engines.find(e=>e.id===step.engine);
    if (!engine || !engine.supported || (data.native_package && !engine.native_installable)) {
      throw Error(step.engine + ' is not supported by this installation');
    }
    const model=step.model && engine.models.find(m=>m.id===step.model);
    if (step.model && !model) throw Error('Unavailable model: ' + step.model);
    if (step.model ? (engine.installed && model.downloaded) : engine.installed) {
      onProgress?.({index:i,total:steps.length,step,status:'skipped',message:'Already installed'});
      continue;
    }
    onProgress?.({index:i,total:steps.length,step,status:'starting',message:'Preparing download'});
    const job=await installerPost(step.engine, step.model);
    await waitForInstall(job, progress=>onProgress?.({index:i,total:steps.length,step,status:progress.status,message:progress.message,job:progress}));
    onProgress?.({index:i,total:steps.length,step,status:'complete',message:'Installed'});
  }
}
export function presetInstallSteps(engine, models) {
  if (engine.id==='kokoro') return [{engine:'kokoro',model:'bm_george'}];
  // Piper has independently downloadable voice files; this curated list is installed
  // as one user-facing bundle while preserving individual files behind the scenes.
  return models.map(m=>({engine:'piper',model:m.id}));
}
