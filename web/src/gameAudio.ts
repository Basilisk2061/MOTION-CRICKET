// Local, short Web Audio transients; audio failure never interrupts gameplay.
export class GameAudio {
  private context: AudioContext | null = null
  private noise: AudioBuffer | null = null
  private ambience: HTMLAudioElement | null = null
  private clips = new Map<string,HTMLAudioElement>()
  private asset(name:string,volume:number,loop=false) {
    let clip=this.clips.get(name)
    if(!clip) {
      clip=new Audio(`/audio/${name}.ogg`);clip.volume=volume;clip.loop=loop
      clip.onerror=()=>clip?.pause();this.clips.set(name,clip)
    }
    return clip
  }
  event(name:'bowler-release'|'keeper-glove') {
    if(!this.context)return
    try {const clip=this.asset(name,.18);clip.currentTime=0;void clip.play().catch(()=>{})} catch {}
  }
  wicketImpact(_speed:number,strength:number){
    if(!this.context)return
    const volume=.70+.25*Math.max(0,Math.min(1,Number.isFinite(strength)?strength:0))
    try {const clip=this.asset('stump-impact',volume);clip.volume=volume;
      clip.playbackRate=1.02-.04*strength;clip.currentTime=0;void clip.play().catch(()=>{})}catch{}
  }
  unlock(ambience=true) {
    try {
      if(ambience){this.ambience??=this.asset('crowd-ambience',.06,true)
      if(this.ambience.paused)void this.ambience.play().catch(()=>{})}
    } catch { /* Missing assets or unavailable HTML audio stay silent. */ }
    try {
      this.context ??= new AudioContext({ latencyHint: 'interactive' })
      if (!this.noise) {
        this.noise = this.context.createBuffer(1,this.context.sampleRate*.18,this.context.sampleRate)
        const data = this.noise.getChannelData(0)
        for(let i=0;i<data.length;i++) data[i] = Math.random()*2-1
      }
      void this.context.resume().catch(()=>{})
    } catch { /* Unsupported or denied audio remains silent. */ }
  }
  impact(quality: 'SWEET'|'GOOD'|'EDGE'|'BOUNCE', speed: number) {
    const c = this.context
    if(!c || c.state !== 'running' || !this.noise) return
    try {
      const bounce = quality === 'BOUNCE', edge = quality === 'EDGE'
      const t = c.currentTime, duration = bounce ? .075 : edge ? .065 : .14
      const volume = (bounce ? .045 : quality === 'SWEET' ? .32 : .22)*Math.min(1,Math.max(.45,speed/22))
      const noise = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain()
      noise.buffer = this.noise; filter.type = 'bandpass'; filter.frequency.value = bounce ? 320 : edge ? 2400 : 1300
      filter.Q.value = .65; gain.gain.setValueAtTime(volume,t); gain.gain.exponentialRampToValueAtTime(.0001,t+duration)
      noise.connect(filter).connect(gain).connect(c.destination); noise.start(t); noise.stop(t+duration)
      const tone = c.createOscillator(), body = c.createGain()
      tone.frequency.setValueAtTime((bounce ? 120 : edge ? 950 : 480)*( .97+Math.random()*.06),t)
      tone.frequency.exponentialRampToValueAtTime(bounce ? 65 : 180,t+duration)
      body.gain.setValueAtTime(volume*.45,t); body.gain.exponentialRampToValueAtTime(.0001,t+duration)
      tone.connect(body).connect(c.destination); tone.start(t); tone.stop(t+duration)
      noise.onended = ()=>{noise.disconnect(); filter.disconnect(); gain.disconnect()}
      tone.onended = ()=>{tone.disconnect(); body.disconnect()}
    } catch { /* A suspended/closed audio device is non-fatal. */ }
  }
  dispose() {
    for(const clip of this.clips.values()){clip.pause();clip.removeAttribute('src');clip.load()}
    this.clips.clear();this.ambience=null
    void this.context?.close().catch(()=>{}); this.context = null; this.noise = null
  }
}
