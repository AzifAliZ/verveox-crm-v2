"""Live RLS regression checks. Run with a minted account session; never prints tokens.

Usage: python3 src/test/security-browser.py employee|manager|inactive|admin PRIVATE_LEAD_UUID
Uses only the app origin. Employee fixtures are explicitly named and cleaned by admin mode.
"""
import asyncio
import json
import sys
from pathlib import Path
from playwright.async_api import async_playwright


async def main():
    mode, private_id = sys.argv[1:3]
    minted = json.loads(Path.home().joinpath('.cache/lovable-auth/session.json').read_text())
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()
        await page.goto('http://localhost:8080')
        await page.evaluate('([k,v])=>localStorage.setItem(k,v)', [minted['storage_key'], json.dumps(minted['session'])])
        await page.goto('http://localhost:8080/leads')
        await page.wait_for_timeout(1500)
        results = await page.evaluate('''async ({mode,privateId}) => {
          const {supabase:s}=await import('/src/integrations/supabase/client.ts');
          const checks=[];
          const check=(name,ok)=>{if(!ok)throw new Error(name);checks.push(name)};
          const {data:{user}}=await s.auth.getUser();
          if(!user)throw new Error('Session missing');
          if(mode==='admin') {
            const rows=await s.from('leads').select('id').eq('email','crm-audit@example.invalid');
            check('Admin reads private fixture',!rows.error && rows.data.length===1);
            const lid=rows.data[0].id;
            const archive=await s.from('leads').update({archived_at:new Date().toISOString()}).eq('id',lid).select('id');
            check('Admin archive persists',!archive.error&&archive.data.length===1);
            const read=await s.from('leads').select('archived_at').eq('id',lid).single();
            check('Archived candidate still readable',!!read.data?.archived_at);
            const restore=await s.from('leads').update({archived_at:null}).eq('id',lid).select('id');
            check('Admin restore persists',!restore.error&&restore.data.length===1);
            const deleted=await s.from('leads').delete().in('email',['crm-audit@example.invalid','crm-rls-test@example.invalid']).select('id');
            check('Temporary candidates cleaned',!deleted.error&&deleted.data.length>=1);
          } else {
            const read=await s.from('leads').select('id').eq('id',privateId);
            check('Private candidate read denied',!read.error&&read.data.length===0);
            const write=await s.from('leads').update({full_name:'Unauthorized'}).eq('id',privateId).select('id');
            check('Private candidate write denied',!!write.error||write.data.length===0);
            const roles=await s.rpc('admin_set_user_role',{_user_id:user.id,_role:'super_admin'});
            check('Role escalation denied',!!roles.error);
            const merge=await s.rpc('merge_leads',{_target:privateId,_source:privateId});
            check('Unauthorized candidate merge denied',!!merge.error);
            if(mode==='employee') {
              const forged=await s.from('leads').insert({full_name:'Forgery',email:'crm-forgery@example.invalid',created_by:'11b509a7-1835-4c2e-a930-b975eacef8c0'});
              check('Creator forgery denied',!!forged.error);
              const own=await s.from('leads').insert({full_name:'Security RLS Temporary Candidate',email:'crm-rls-test@example.invalid',source:'manual',assigned_to:user.id}).select('id').single();
              check('Employee creates own lead',!own.error&&!!own.data);
              const id=own.data.id;
              const provenance=await s.from('leads').update({created_by:'11b509a7-1835-4c2e-a930-b975eacef8c0'}).eq('id',id);
              check('Creator mutation denied',!!provenance.error);
              const score=await s.from('leads').update({score:100}).eq('id',id);
              check('Direct score mutation denied',!!score.error);
              const fu=await s.from('followups').insert({lead_id:id,assigned_to:user.id,title:'RLS regression follow-up',followup_type:'call',due_at:new Date().toISOString()}).select('id').single();
              check('Authorized follow-up created',!fu.error&&!!fu.data);
              const moved=await s.from('followups').update({lead_id:privateId}).eq('id',fu.data.id);
              check('Follow-up retarget denied',!!moved.error);
              const completed=await s.from('followups').update({status:'completed'}).eq('id',fu.data.id).select('completed_at').single();
              check('Completion timestamp generated',!completed.error&&!!completed.data.completed_at);
              const note=await s.from('activities').insert({lead_id:id,actor_id:user.id,activity_type:'system'});
              check('Forged system activity denied',!!note.error);
              const consent=await s.from('consent_records').insert({lead_id:id,purpose:'marketing',consent_status:'withdrawn'});
              check('Consent withdrawal persists',!consent.error);
              const after=await s.from('leads').select('marketing_opt_out,last_contacted_at').eq('id',id).single();
              check('Consent and contact triggers apply',after.data?.marketing_opt_out===true&&!!after.data.last_contacted_at);
              const audit=await s.from('audit_logs').insert({action:'fake',entity_type:'lead'});
              check('Audit forgery denied',!!audit.error);
              const metrics=await s.rpc('dashboard_metrics',{_from:'2000-01-01T00:00:00Z',_to:'2100-01-01T00:00:00Z'});
              const visible=await s.from('leads').select('id',{count:'exact'}).is('archived_at',null);
              check('Dashboard matches visible leads',!metrics.error&&metrics.data.total_all===visible.count);
            }
            if(mode==='inactive') {
              for(const table of ['leads','activities','followups','import_jobs','export_jobs','saved_views','notifications']) {
                const rows=await s.from(table).select('*');
                check('Inactive denied '+table,!rows.error&&rows.data.length===0);
              }
              const insert=await s.from('leads').insert({full_name:'Inactive',email:'inactive-test@example.invalid',source:'manual'});
              check('Inactive creation denied',!!insert.error);
            }
          }
          await s.auth.signOut();
          const anon=await s.from('leads').select('id');
          check('Anonymous candidate access denied',!!anon.error);
          return checks;
        }''', {'mode': mode, 'privateId': private_id})
        for result in results:
            print('PASS:', result)
        await browser.close()


asyncio.run(main())