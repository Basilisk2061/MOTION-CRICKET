import type { WicketImpact } from './wicketImpact'
export const WICKET_PRESENTATION_HOLD_MS=1500
// Wall-clock presentation timing; never delays authoritative scoring.
export class WicketPresentationHold {
 private event:WicketImpact|null=null
 private until=0
 active(event:WicketImpact|null,now:number){
  if(event!==this.event){this.event=event;this.until=event?now+WICKET_PRESENTATION_HOLD_MS:0}
  return !!event&&now<this.until
 }
 remaining(now:number){return Math.max(0,this.until-now)}
}
