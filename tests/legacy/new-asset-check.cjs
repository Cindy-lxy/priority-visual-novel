// Historical test source; update old chapter/node expectations before use.
'use strict';
const {chromium}=require('playwright'),http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert');
const root=fs.realpathSync(process.env.GAME_DIR||path.resolve(__dirname,'../..')),out=__dirname;
const server=http.createServer((req,res)=>{
  let p=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));
  if(p===root)p=path.join(root,'index.html');
  if(!p.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  fs.readFile(p,(e,d)=>{
    if(e){res.writeHead(404);return res.end();}
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp'})[path.extname(p)]||'application/octet-stream');
    res.end(d);
  });
});
let browser;
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
  for(const [width,height] of [[1440,900],[390,844]]){
    const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
    await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'networkidle'});
    await page.evaluate(()=>{state={...fresh(),c:1,n:2,b:{option:0,cursor:1},gate:false};render();});
    await page.waitForFunction(()=>document.querySelector('.focus-preview img')?.complete&&document.querySelector('.focus-preview img').naturalWidth>0);
    assert((await page.locator('.focus-preview img').getAttribute('src')).includes('photo-sunset-taken.webp'));
    await page.screenshot({path:path.join(out,'new-sunset-'+width+'.webp')});
    await page.evaluate(()=>{state={...fresh(),c:1,n:2,b:{option:1,cursor:1},gate:false};render();});
    await page.waitForFunction(()=>document.querySelector('.puzzle-photo')?.complete&&document.querySelector('.puzzle-photo').naturalWidth>0);
    assert((await page.locator('.puzzle-photo').getAttribute('src')).includes('photo-toy-received.webp'));
    assert((await page.locator('#task').textContent()).includes('奶白头盔、黄眼睛的灰色小机器人'));
    await page.screenshot({path:path.join(out,'new-toy-'+width+'.webp')});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    assert.deepEqual(errors,[]);
    await page.close();
  }
  console.log(JSON.stringify({status:'PASS',assets:['photo-sunset-taken','photo-toy-received'],viewports:[1440,390]},null,2));
})().then(async()=>{if(browser)await browser.close();server.close();}).catch(async e=>{console.error(e);if(browser)await browser.close();server.close();process.exitCode=1;});
