'use server';
import {redirect} from 'next/navigation';import {revalidatePath} from 'next/cache';
import {decideReview} from '@/lib/database';
import {assertSameOrigin,requireAdminSession} from '@/lib/admin-auth';
export async function decide(form:FormData){
  await assertSameOrigin();await requireAdminSession();
  const decision=String(form.get('decision'));
  if(decision!=='approved'&&decision!=='rejected')throw new Error('Invalid decision');
  const note=String(form.get('note')||'').trim();if(note.length<4)throw new Error('请填写至少 4 个字的审核说明');
  await decideReview({queueId:String(form.get('queue_id')),decision,note});
  revalidatePath('/admin/review');revalidatePath('/api/v1/deals');redirect('/admin/review?saved=1');
}
