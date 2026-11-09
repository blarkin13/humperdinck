"""Reference cache must never return a previous speaker after file replacement."""
from backend.qwen_torch_engine import reference_identity, QwenTorchEngine


def test_reference_prompt_identity_changes_with_audio_bytes(tmp_path):
    reference=tmp_path/"saved_voice.wav"
    reference.write_bytes(b"Speaker One - sample")
    one=reference_identity(reference,"Words")
    assert one==reference_identity(reference,"Words")
    assert one!=reference_identity(reference,"Different transcript")
    reference.write_bytes(b"Speaker Two - sample")
    two=reference_identity(reference,"Words")
    assert one!=two
    assert one[0]==two[0]


def test_qwen_cloning_refreshes_voice_prompt_after_edit(tmp_path):
    reference=tmp_path/"recording.wav"
    reference.write_bytes(b"A reference speaker")
    class FakeModel:
        prompts_created=0
        def create_voice_clone_prompt(self,**kwargs):
            self.prompts_created+=1
            return {"speaker_version":self.prompts_created}
        def generate_voice_clone(self,**kwargs):
            return [[0.0,0.0,0.0]], 24000
    engine=QwenTorchEngine("fake-model")
    fake=FakeModel()
    engine.model=fake
    outputs=[]
    engine._write=lambda parts,rate,destination:outputs.append((len(parts),rate))
    engine.clone("First sample.",reference,tmp_path/"one.wav")
    engine.clone("Second sample.",reference,tmp_path/"two.wav")
    assert fake.prompts_created==1
    reference.write_bytes(b"B reference speaker")
    engine.clone("Third sample.",reference,tmp_path/"three.wav")
    assert fake.prompts_created==2
    assert len(engine.prompts)==1  # never keep a stale prompt for the same path
    assert len(outputs)==3
