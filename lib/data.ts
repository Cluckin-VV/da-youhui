import fs from 'node:fs';import path from 'node:path';import {Deal,DealStatus,Feedback} from './types';
const dealsPath=path.join(process.cwd(),'data','deals.json');const feedbackPath=path.join(process.cwd(),'data','feedback.json');
export function effectiveStatus(d:Deal):DealStatus{if(d.status==='offline')return'offline';if(d.end_date&&new Date(d.end_date+'T23:59:59')<new Date())return'possibly_expired';return d.status}
export function getDeals(includeHidden=false):Deal[]{const rows=JSON.parse(fs.readFileSync(dealsPath,'utf8')) as Deal[];return rows.filter(d=>includeHidden||d.is_visible).map(d=>({...d,status:effectiveStatus(d)}));}
export function getDeal(id:string){return getDeals(true).find(d=>d.id===id)}
export function saveDeal(deal:Deal){const rows=getDeals(true);const i=rows.findIndex(d=>d.id===deal.id);if(i>=0)rows[i]=deal;else rows.unshift(deal);fs.writeFileSync(dealsPath,JSON.stringify(rows,null,2));}
export function incrementClick(id:string){const d=getDeal(id);if(!d)return;saveDeal({...d,click_count:d.click_count+1,updated_at:new Date().toISOString().slice(0,10)});}
export function getFeedback():Feedback[]{return JSON.parse(fs.readFileSync(feedbackPath,'utf8'))}
export function addFeedback(item:Feedback){const rows=getFeedback();rows.unshift(item);fs.writeFileSync(feedbackPath,JSON.stringify(rows,null,2));if(item.type==='expired'){const d=getDeal(item.deal_id);if(d)saveDeal({...d,report_count:d.report_count+1});}}
