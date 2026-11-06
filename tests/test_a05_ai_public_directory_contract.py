"""A05 Council directory SQL least-privilege and fallback contract."""
from pathlib import Path
import unittest
R=Path(__file__).resolve().parents[1]
class ScopedAiPublicDirectory(unittest.TestCase):
 def test_five_column_public_view_and_role_confinement(self):
  s=(R/'config/nonfinancial-public-ai-council-v14.sql').read_text()
  self.assertIn('WITH (security_barrier=true)',s)
  self.assertIn('SELECT a.slug,a.name,a.role,a.description,a.specialty',s)
  self.assertIn('WHERE a.enabled IS TRUE AND a.public IS TRUE',s)
  self.assertIn('GRANT SELECT ON aoe2war_public_v2.ai_published_council TO aoe2war_web_prod',s)
  self.assertIn("has_table_privilege('aoe2war_web_prod','public.ai_agents','SELECT')",s)
  self.assertIn("has_table_privilege('aoe2war_web_prod','public.ai_request_traces','SELECT')",s)
  self.assertNotIn('GRANT SELECT ON public.ai_agents',s)
  for private in ('a.personality_prompt','a.aoe2_prompt','a.requested_model','a.allowed_tools','a.knowledge_scopes','a.introduction'):
   self.assertNotIn(private,s)
 def test_page_loader_is_fail_closed(self):
  s=(R/'app/ai/page.tsx').read_text()
  l=(R/'lib/nonfinancialPublicAiDirectory.ts').read_text()
  self.assertIn('FROM aoe2war_public_v2.ai_published_council',l)
  self.assertNotIn('aiAgent.find',l)
  self.assertIn('catch {',s)
  self.assertIn('!restricted ? <AiCouncilClient',s)
  self.assertIn('data-public-read-model={projectionAvailable ?',s)
if __name__=='__main__': unittest.main()
