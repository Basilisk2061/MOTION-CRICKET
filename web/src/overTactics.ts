import type { Delivery } from './delivery'
import type { SessionScore } from './sessionScore'
import type { FieldingController } from './fielding'
import { chooseTactic, type Tactic } from './bowlingTactics'
import { applyFieldPlan, chooseFieldPlan, type FieldPlan } from './fieldPlans'

export class OverTactics {
  over=-1
  field: FieldPlan | null=null
  previousField: FieldPlan | null=null
  private tactics: Tactic[]=[]
  private fields: FieldPlan[]=[]
  trace: Record<string,unknown> | null=null
  constructor(private random:()=>number=Math.random) {}
  update(game: Delivery, session: SessionScore, fielding: FieldingController) {
    if(game.state!=='READY'||this.over===session.currentOver)return false
    const type=session.bowlerType
    game.tactic=chooseTactic(type,this.random,this.tactics.filter(p=>type==='FAST'
      ? ['ATTACK_OFF_STUMP','SWING_ATTACK','YORKER_ATTACK','SHORT_BALL_TRAP','CHANNEL_PRESSURE','BALANCED'].includes(p)
      : ['ATTACK_STUMPS','OUTSIDE_OFF_TRAP','TURN_AWAY_PRESSURE','TURN_IN_ATTACK','FLIGHT_AND_DECEIVE','BALANCED'].includes(p)))
    this.previousField=this.field
    this.field=chooseFieldPlan(type,game.tactic,this.random,this.fields.filter(p=>p.startsWith(type+'_')))
    const old=fielding.fielders.map(f=>f.position.toArray())
    applyFieldPlan(fielding,this.field,true)
    this.trace={over:session.currentOver+1,bowler:type,tactic:game.tactic,selected:this.field,previous:this.previousField,
      formationChanged:fielding.fielders.some((f,i)=>f.position.toArray().some((n,j)=>n!==old[i][j])),
      fielders:fielding.fielders.map((f,i)=>({role:f.role,oldXYZ:old[i],newXYZ:f.position.toArray()}))}
    this.over=session.currentOver;this.tactics.push(game.tactic);this.fields.push(this.field)
    return true
  }
}
