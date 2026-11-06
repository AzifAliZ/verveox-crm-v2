import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright

async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  context=await browser.new_context(viewport={"width":1280,"height":1800})
  page=await context.new_page()
  with open(os.path.expanduser('~/.cache/lovable-auth/session.json')) as f: minted=json.load(f)
  if minted.get('cookies'): await context.add_cookies([{**c,'url':'http://localhost:8080'} for c in minted['cookies']])
  await page.goto('http://localhost:8080')
  await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[minted['storage_key'],json.dumps(minted['session'])])
  await page.goto('http://localhost:8080/pipeline')
  await page.get_by_role('heading',name='Pipeline',exact=True).wait_for()
  await page.wait_for_timeout(1000)
  await page.evaluate("async()=>{window.crm=(await import('/src/integrations/supabase/client.ts')).supabase}")
  lead_id=await page.evaluate("""async()=>{const {data,error}=await crm.from('leads').insert({full_name:'Scoring Verification Candidate',email:'scoring-check@example.invalid',source:'manual',priority:'urgent'}).select('id').single();if(error)throw Error(error.message);return data.id}""")
  try:
   check=await page.evaluate("""async(id)=>{const crm=(await import('/src/integrations/supabase/client.ts')).supabase;let r=await crm.from('leads').update({utm_source:'ad_click'}).eq('id',id).select('score,temperature,stage,priority').single();if(r.error)throw Error(r.error.message);return r.data}""",lead_id)
   assert check=={'score':0,'temperature':'cold','stage':'new','priority':'urgent'},check
   bad=await page.evaluate("""async()=>{const crm=(await import('/src/integrations/supabase/client.ts')).supabase;let r=await crm.from('scoring_rules').insert({key:'test_ad_click',label:'Ad click',points:100,evidence_type:'ad_click'});return !!r.error}""")
   assert bad
   print('AD CLICK EXCLUSION PASS')
   await page.goto('http://localhost:8080/leads/'+lead_id)
   await page.get_by_role('heading',name='Scoring Verification Candidate',exact=True).wait_for()
   rules=await page.evaluate("async()=>{const crm=(await import('/src/integrations/supabase/client.ts')).supabase;const r=await crm.from('scoring_rules').select('*').order('sort_order');return r.data}")
   defaults=[25,20,15,15]
   assert [r['points'] for r in rules[:4]]==defaults
   for i,expected in enumerate([25,45,60,75]):
    await page.get_by_role('checkbox',name='Scoring signal: '+rules[i]['label'],exact=True).click()
    await page.get_by_text('Score '+str(expected),exact=True).wait_for()
    data=await page.evaluate("async(id)=>{const crm=(await import('/src/integrations/supabase/client.ts')).supabase;const r=await crm.from('leads').select('score,temperature,stage,priority').eq('id',id).single();return r.data}",lead_id)
    assert data['score']==expected and data['temperature']==('cold' if expected<35 else 'warm' if expected<70 else 'hot') and data['stage']=='new' and data['priority']=='urgent',data
   print('SCORING BOUNDARIES AND INDEPENDENCE PASS')
   count=await page.evaluate("async(id)=>{const crm=(await import('/src/integrations/supabase/client.ts')).supabase;const r=await crm.from('lead_score_history').select('id').eq('lead_id',id);return r.data.length}",lead_id)
   await page.get_by_label('Candidate temperature',exact=True).select_option('hot')
   await page.wait_for_timeout(700)
   after=await page.evaluate("async(id)=>{const crm=(await import('/src/integrations/supabase/client.ts')).supabase;const r=await crm.from('lead_score_history').select('id').eq('lead_id',id);return r.data.length}",lead_id)
   assert after==count+1
   await page.get_by_role('checkbox',name='Scoring signal: '+rules[0]['label'],exact=True).click()
   await page.get_by_text('Score 50',exact=True).wait_for()
   data=await page.evaluate("async(id)=>{const crm=(await import('/src/integrations/supabase/client.ts')).supabase;const r=await crm.from('leads').select('temperature').eq('id',id).single();return r.data}",lead_id)
   assert data['temperature']=='hot'
   await page.get_by_label('Candidate temperature',exact=True).select_option('auto')
   await page.wait_for_timeout(600)
   await page.get_by_label('Candidate priority',exact=True).select_option('low')
   await page.wait_for_timeout(600)
   await page.reload()
   await page.get_by_label('Candidate priority',exact=True).wait_for()
   assert await page.get_by_label('Candidate priority',exact=True).input_value()=='low'
   print('MANUAL OVERRIDE HISTORY AND REFRESH PASS')
   await page.goto('http://localhost:8080/pipeline')
   card=page.get_by_label('Candidate Scoring Verification Candidate',exact=True)
   await card.wait_for()
   await card.drag_to(page.get_by_label('Qualified stage',exact=True))
   await page.wait_for_timeout(900)
   await page.reload()
   card=page.get_by_label('Candidate Scoring Verification Candidate',exact=True)
   await card.wait_for()
   assert await page.get_by_label('Move Scoring Verification Candidate to stage',exact=True).input_value()=='qualified'
   data=await page.evaluate("async(id)=>{const crm=(await import('/src/integrations/supabase/client.ts')).supabase;const r=await crm.from('leads').select('stage,temperature,score,priority').eq('id',id).single();return r.data}",lead_id)
   assert data=={'stage':'qualified','temperature':'warm','score':50,'priority':'low'},data
   await page.screenshot(path='/tmp/browser/scoring/pipeline.png')
   print('DRAG PERSISTENCE AND INDEPENDENCE PASS')
   async def reject(route):
    if route.request.method not in ('GET','HEAD','OPTIONS'): await route.fulfill(status=403,content_type='application/json',body=json.dumps({'message':'Stage save denied','code':'42501'}))
    else: await route.continue_()
   await page.route('**/*',reject)
   await page.get_by_label('Move Scoring Verification Candidate to stage',exact=True).select_option('enrolled')
   await page.wait_for_timeout(1500)
   await page.wait_for_timeout(800)
   assert await page.get_by_label('Move Scoring Verification Candidate to stage',exact=True).input_value()=='qualified'
   await page.unroute('**/*',reject)
   print('FAILED MOVE RECOVERY PASS')
   await page.get_by_label('Stage',exact=True).select_option('qualified')
   await page.get_by_label('Temperature',exact=True).select_option('warm')
   await card.wait_for()
   await page.get_by_label('Temperature',exact=True).select_option('cold')
   await card.wait_for(state='hidden')
   print('STAGE TEMPERATURE FILTERS PASS')
   history=await page.evaluate("async(id)=>{const crm=(await import('/src/integrations/supabase/client.ts')).supabase;const r=await crm.from('lead_stage_history').select('new_stage').eq('lead_id',id);return r.data}",lead_id)
   assert any(r['new_stage']=='qualified' for r in history)
   print('DATABASE STAGE HISTORY PASS')
   await page.evaluate("async()=>{const crm=(await import('/src/integrations/supabase/client.ts')).supabase;await crm.auth.signOut()}")
   denied=await page.evaluate("async(id)=>{const crm=(await import('/src/integrations/supabase/client.ts')).supabase;const r=await crm.from('leads').select('id').eq('id',id);return !!r.error || r.data?.length===0}",lead_id)
   assert denied
   denied=await page.evaluate("async(id)=>{const crm=(await import('/src/integrations/supabase/client.ts')).supabase;const r=await crm.from('leads').update({stage:'enrolled'}).eq('id',id).select('id');return !!r.error || r.data?.length===0}",lead_id)
   assert denied
   await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[minted['storage_key'],json.dumps(minted['session'])])
   await page.goto('http://localhost:8080/pipeline')
   await page.get_by_role('heading',name='Pipeline',exact=True).wait_for()
   print('UNAUTHENTICATED CANDIDATE READ AND STAGE WRITE DENIED PASS')
  finally:
   result=await page.evaluate("async(id)=>{const crm=(await import('/src/integrations/supabase/client.ts')).supabase;const r=await crm.from('leads').delete().eq('id',id).select('id');return {count:r.data?.length,error:r.error?.message}}",lead_id)
   assert result.get('count')==1,result
   print('TEST CANDIDATE CLEANED')
  await browser.close()
asyncio.run(main())
