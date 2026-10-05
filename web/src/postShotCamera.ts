import { Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three'
import type { KeeperBall } from './keeperPresentation'

export type PostCameraMode = 'BATSMAN'|'FORWARD_FOLLOW'|'KEEPER_FOLLOW'|'RETURNING'
export class PostShotCamera {
  mode: PostCameraMode='BATSMAN'
  private keeperFollow=false
  private side=-1
  private target=new Vector3()
  private composition=new Vector3()
  private desired=new Quaternion()
  private matrix=new Matrix4()
  private up=new Vector3(0,1,0)
  private destination=new Vector3()
  reset() {this.mode='BATSMAN';this.keeperFollow=false}
  select(ball: KeeperBall, cameraState: string) {
    if(cameraState==='BATSMAN_VIEW') {this.reset();return this.mode}
    if(cameraState==='RETURNING') {this.mode='RETURNING';return this.mode}
    if(this.mode==='BATSMAN') {
      this.keeperFollow=ball.outcome==='MISSED' || ball.velocity.z>Math.max(1,ball.velocity.length()*.18)
      this.side=ball.position.x<0 ? 1 : -1;this.target.copy(ball.position)
    }
    this.mode=this.keeperFollow?'KEEPER_FOLLOW':'FORWARD_FOLLOW'
    return this.mode
  }
  get returningFromKeeper() {return this.keeperFollow}
  update(camera: PerspectiveCamera,ball: KeeperBall,center: Vector3,dt: number,returning=false) {
    dt=Math.min(dt,.05)
    if(returning) {this.destination.set(0,1.68,.35);this.target.set(0,1.35,-12)}
    else {
      // Remain in front of the wicket/keeper, then let distant balls take priority.
      this.destination.set(this.side*1.8,2.45,-1.1)
      this.composition.copy(ball.position).multiplyScalar(.7).addScaledVector(center,.3)
      this.target.lerp(this.composition,1-Math.exp(-dt/.10))
      this.target.y=Math.max(.5,this.target.y)
    }
    camera.position.lerp(this.destination,1-Math.exp(-dt/(returning?.14:.30)))
    this.matrix.lookAt(camera.position,this.target,this.up);this.desired.setFromRotationMatrix(this.matrix)
    const angle=camera.quaternion.angleTo(this.desired)
    const step=Math.min(angle*(1-Math.exp(-dt/.13)),6*dt)
    camera.quaternion.rotateTowards(this.desired,step)
  }
}
