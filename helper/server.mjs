import express from 'express';
import dns from 'node:dns/promises';
import net from 'node:net';
import { chromium } from 'playwright';
const app=express(); app.use(express.json({limit:'16kb'}));
function unsafe(host){ if(net.isIP(host)){const p=host.split('.').map(Number); return host==='::1'||host.startsWith('fc')||host.startsWith('fd')||host.startsWith('fe80')||(p[0]===10)||(p[0]===127)||(p[0]===169&&p[1]===254)||(p[0]===192&&p[1]===168)||(p[0]===172&&p[1]>=16&&p[1]<=31);} return ['localhost','localhost.localdomain'].includes(host.toLowerCase()); }
async function safeUrl(value){const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||unsafe(u.hostname))throw Error('Only public HTTP(S) URLs are allowed');const addresses=await dns.lookup(u.hostname,{all:true});if(addresses.some(a=>unsafe(a.address)))throw Error('Private network target blocked');return u;}
app.post('/screenshot',async(req,res)=>{let browser;try{let u=await safeUrl(req.body?.url);browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:false});page.setDefaultNavigationTimeout(15000);await page.goto(u.href,{waitUntil:'networkidle'});const png=await page.screenshot({type:'png'});res.type('png').send(png);}catch(e){res.status(400).json({error:e.message});}finally{await browser?.close();}});
app.listen(8765,'127.0.0.1',()=>console.log('Screenshot helper listening on http://127.0.0.1:8765'));
