const memory=new Set<string>()
export const HELP_KEYS={tutorial:'motionCricket.battingTutorialSeen'} as const
export function hasSeen(key:string){try{return memory.has(key)||localStorage.getItem(key)==='1'}catch{return memory.has(key)}}
export function markSeen(key:string){memory.add(key);try{localStorage.setItem(key,'1')}catch{/* Private browsing can refuse storage. */}}
export const BATTING_STEPS=[
 {title:'Set up your space',body:'Keep your right arm visible to the webcam. Stand side-on in your natural batting stance, with your right hand at your normal grip position.',hint:'Leave room to swing safely. Keep your phone securely held—never throw it.'},
 {title:'Connect your phone',body:'Open the secure controller link below on your phone. Your phone controls the bat angle; your tracked right hand controls its position.',hint:'Keep the controller page open while you play.'},
 {title:'Calibrate your grip',body:'On your phone, tap Enable motion and allow sensor access. Hold the phone naturally in your batting stance, then tap Calibrate.',hint:'Press C in the webcam window to recalibrate hand position. Phone Recalibrate resets the bat angle.'},
 {title:'Call for the ball',body:'Press Space, or raise the bat into the call gesture and hold. Watch the bowler, then play your shot.',hint:'Beginner Assist starts on: slower deliveries and more forgiving contact and timing. You can switch it off from the batting HUD.'},
] as const
export const ASSIST_COPY={intro:'Makes motion batting more forgiving while you learn.',items:['Deliveries are about 10% slower','More forgiving phone-bat contact and timing','Recent swings can rescue some near misses','Assisted contacts receive more forgiving shot grading and power'],outro:'Field placements, scoring and wicket rules stay the same.'} as const
export function controllerLabel(status:string,calibrated:boolean){
 if(status==='DISCONNECTED')return 'Phone disconnected'
 if(status==='STALE')return 'Phone signal stale'
 return calibrated?'Phone ready':'Calibrate on phone'
}
export function battingFeedback(game:{quality:string|null;match:{result:string|null;exitSpeed:number}}){
 const result=game.match.result,quality=game.quality
 if(result)return {title:result==='DOT'?'Dot ball':result,detail:quality?`${quality.toLowerCase()} contact`:''}
 if(!quality)return null
 const speed=game.match.exitSpeed
 return {title:quality,detail:Number.isFinite(speed)&&speed>0?`Exit speed ${speed.toFixed(1)} game units/s`:''}
}
