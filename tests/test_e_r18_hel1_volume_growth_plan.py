import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('grow',Path(__file__).parents[1]/'scripts'/'aoe2_hel1_volume_growth_plan.py')
g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)

class Capacity(unittest.TestCase):
 def setUp(self):
  self.T=316935307264;self.U=281988124672;self.F=21916962816
 def test_exact_owner_native_measurement_fails_three_gates(self):
  c=g.capacity(self.T,self.U,self.F)
  self.assertEqual(c['available_gib'],20.411762)
  self.assertEqual(c['effective_used_pct'],92.788221)
  self.assertEqual(c['finish_used_pct'],93.084720)
  self.assertFalse(g.capacity_pass(c))
 def test_growth_gap_closes_only_after_actual_blocks(self):
  delta=g.required_extra_usable(self.T,self.U,self.F)
  self.assertAlmostEqual(delta/g.GIB,15.400316,places=5)
  self.assertFalse(g.capacity_pass(g.capacity(self.T+delta-1,self.U,self.F+delta-1)))
  self.assertTrue(g.capacity_pass(g.capacity(self.T+delta,self.U,self.F+delta)))
 def test_25_gb_conservative_margin(self):
  delta=g.required_extra_usable(self.T,self.U,self.F)
  self.assertGreater(25*g.GB*0.92-delta,3*g.GIB)
 def test_exact_hardware_identity(self):
  g.validate_identity(g.HOST,1000,True,2064,2049,g.SOURCE,'ext4',str(g.MOUNT),'sdb','Volume',g.ID,320*g.GB)
 def test_wrong_mount_or_root_alias_rejected(self):
  for kw in ({'root_dev':2064},{'mount_source':'/dev/sda'},{'fstype':'xfs'},{'target':'/'}, {'serial':'123456789'}, {'model':'QEMU_HARDDISK'}, {'uid':0}):
   d=dict(host=g.HOST,uid=1000,ismount=True,mount_dev=2064,root_dev=2049,mount_source=g.SOURCE,fstype='ext4',target=str(g.MOUNT),disk='sdb',model='Volume',serial=g.ID,disk_bytes=320*g.GB);d.update(kw)
   with self.subTest(kw=kw),self.assertRaises(g.Hold):g.validate_identity(**d)
 def test_owner_quote_must_be_current_and_exact(self):
  self.assertEqual(g.check_quote(320,345,'1.43',320*g.GB,'plan'),'1.43')
  for cur,tgt,quote,phys,phase in [(320,346,'1.43',320*g.GB,'plan'),(320,345,'0',320*g.GB,'plan'),(320,345,'NaN',320*g.GB,'plan'),(320,345,'1.43',330*g.GB,'plan'),(320,345,'1.43',320*g.GB,'post-provider')]:
   with self.subTest(cur=cur,tgt=tgt,quote=quote,phase=phase),self.assertRaises(g.Hold):g.check_quote(cur,tgt,quote,phys,phase)
 def test_read_only_plan_output_never_claims_production(self):
  a=SimpleNamespace(phase='plan',console_volume_id=g.ID,console_current_gb=320,console_target_gb=345,console_incremental_eur_month='1.43')
  r=g.report(g.capacity(self.T,self.U,self.F),320*g.GB,2064,a)
  self.assertEqual(r['capacity_verdict'],'HOLD_CAPACITY_BELOW_ADMISSION')
  self.assertEqual(r['provider_price_proof'],'OWNER_TYPED_UNVERIFIED_BY_PROVIDER_API')
  self.assertEqual(r['release_authorization'],'NONE')
  self.assertFalse(r['cloud_action_or_fs_resize_performed'])
 def test_post_fs_requires_real_capacity(self):
  a=SimpleNamespace(phase='post-fs',console_volume_id=g.ID,console_current_gb=320,console_target_gb=345,console_incremental_eur_month='1.43')
  with self.assertRaises(g.Hold):g.report(g.capacity(self.T,self.U,self.F),345*g.GB,2064,a)
 def test_no_mutation_capabilities(self):
  code=Path(g.__file__).read_text()
  for bad in ('resize2fs', 'os.remove(', 'os.unlink(', 'os.system(', 'swapon(', 'swapoff(', 'subprocess.Popen(', 'mkfs', 'hetzner-cloud resize'):
   self.assertNotIn(bad,code)

if __name__=='__main__':unittest.main()
