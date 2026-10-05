import unittest
import numpy as np
from position_3d import PositionGuard
from tracking_3d import WorldTracker, LANDMARKS
from test_tracking_3d import result

class RightHandTests(unittest.TestCase):
    def test_stationary_noise_reduced(self):
        guard=PositionGuard();guard.update(np.zeros(3),1,0,.4)
        raw=[];output=[]
        for i in range(1,160):
            value=np.array([.002*np.sin(i),.001*np.cos(i),.0015*np.sin(i*1.7)])
            position,accepted,_,_=guard.update(value,1,i/30,.4)
            self.assertTrue(accepted);raw.append(value);output.append(position)
        self.assertLess(np.var(output[20:],axis=0).sum(),np.var(raw[20:],axis=0).sum()*.95)

    def test_slow_and_fast_first_sample(self):
        guard=PositionGuard();guard.update(np.zeros(3),1,0,.4)
        for i in range(1,25):
            target=np.array([i*.003,0,0])
            position,accepted,_,_=guard.update(target,1,i/30,.4)
            self.assertTrue(accepted)
            self.assertLess(np.linalg.norm(position-target),.002)
        target=np.array([.35,.12,-.25])
        position,accepted,_,_=guard.update(target,1,25/30,.4)
        self.assertTrue(accepted);np.testing.assert_allclose(position,target,atol=.001)

    def test_invalid_sample_hold_and_immediate_recovery(self):
        guard=PositionGuard();guard.update(np.zeros(3),1,0,.4)
        last=guard.update(np.array([.1,0,0]),1,1/30,.4)[0]
        for i,bad in enumerate((np.ones(3)*99,np.array([np.nan,0,0]),np.array([0,0,np.inf]),None),2):
            position,accepted,_,_=guard.update(bad,1,i/30,.4)
            self.assertFalse(accepted);np.testing.assert_array_equal(position,last)
        position,accepted,_,_=guard.update(np.array([.2,0,-.1]),1,6/30,.4)
        self.assertTrue(accepted);self.assertGreater(position[0],last[0])
        self.assertLess(position[2],-.08)

    def test_confidence_duplicate_and_missing(self):
        guard=PositionGuard();guard.update(np.zeros(3),1,0,.4)
        self.assertFalse(guard.update(np.ones(3),.1,1/30,.4)[1])
        self.assertTrue(guard.update(np.array([.03,0,0]),1,2/30,.4)[1])
        last=guard.position.copy();guard.update(np.ones(3),1,2/30,.4)
        np.testing.assert_array_equal(guard.position,last)
        self.assertIsNone(guard.update(None,0,1,.4)[0])
        self.assertTrue(guard.update(np.zeros(3),1,1.03,.4)[1])

    def test_left_hand_overlap_has_zero_control_or_rejection(self):
        a,b=WorldTracker(),WorldTracker()
        for i in range(45):
            shift=(i*.003,0,-i*.002)
            first,second=result(shift=shift),result(shift=shift)
            for name in ('left_wrist','left_elbow'):
                p=second.pose_world_landmarks[0][LANDMARKS[name]]
                p.x,p.y,p.z=(-.2,-.3,-.1) if i%2 else (99,99,99)
            x=a.update(first,1/30,i/30);y=b.update(second,1/30,i/30)
            self.assertTrue(x['sample_accepted']);self.assertTrue(y['sample_accepted'])
            np.testing.assert_allclose(x['grip'],y['grip'],atol=1e-12)

    def test_depth_without_forearm_rejection(self):
        tracker=WorldTracker()
        for i in range(15):
            data=tracker.update(result(shift=(0,0,-i*.035)),1/30,i/30)
            self.assertTrue(data['sample_accepted'])
            self.assertLess(abs(data['grip'][2]-(-.4-i*.035)),.001)

    def test_world_hold_then_first_valid_resume(self):
        tracker=WorldTracker()
        previous=tracker.update(result(),1/30,0)['grip'].copy()
        held=tracker.update(result(missing=True),1/30,1/30)
        self.assertEqual(held['grip_status'],'HELD');np.testing.assert_array_equal(held['grip'],previous)
        resumed=tracker.update(result(shift=(.2,0,0)),1/30,2/30)
        self.assertTrue(resumed['sample_accepted']);self.assertEqual(resumed['grip_status'],'VALID')
        self.assertGreater(resumed['grip'][0],previous[0]+.19)

if __name__=='__main__':unittest.main()
