import unittest
import numpy as np
from train import make_data,split_masks,ROADS
class IntegrityTests(unittest.TestCase):
    def test_all_cities_are_represented_in_every_partition(self):
        x,y,t=make_data(7);masks=split_masks(t)
        self.assertEqual(len({r['cityId'] for r in ROADS}),11)
        self.assertEqual(len({r['id'] for r in ROADS}),72)
        for mask in masks:self.assertEqual(set(x[mask,3]),set(range(72)))
    def test_split_purges_future_targets_and_groups_roads(self):
        x,y,t=make_data(7);a,b,c=split_masks(t)
        self.assertLess(max(t[a])+3600,min(t[b]));self.assertLess(max(t[b])+3600,min(t[c]))
        self.assertFalse(set(t[a])&set(t[b]));self.assertFalse(set(t[b])&set(t[c]))
        self.assertTrue(np.isfinite(x).all());self.assertEqual(set(y),{15,30,60})
    def test_features_use_only_current_and_past_values(self):
        x,y,t=make_data(2)
        road=x[x[:,3]==0]
        np.testing.assert_allclose(road[1:,5],road[:-1,4]);np.testing.assert_allclose(road[2:,6],road[:-2,4])
        np.testing.assert_allclose(road[3:,7],np.convolve(road[:,4],np.ones(4)/4,mode='valid'))
if __name__=='__main__':unittest.main()
