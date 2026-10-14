// 优惠状态机：依据「来源可信度 + 有效期 + 最后验证时间 + 用户反馈 + 人工复核」
// 推导每条优惠的「建议状态」，并标记是否需要人工复核。
// 引擎只产出建议，不直接改写线上状态，避免误伤。

const CADENCE_DAYS = { daily: 1, weekly: 7, biweekly: 14, monthly: 30, quarterly: 90 };

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  const da = new Date(a + 'T00:00:00');
  const db = new Date(b + 'T00:00:00');
  return Math.round((db - da) / 86400000);
}

// deal: 优惠对象；today: YYYY-MM-DD（可选，默认今天）
// 返回 { suggested, needsReview, reasons }
function computeStatus(deal, today) {
  today = today || todayStr();
  const end = deal.end_date;
  const last = deal.last_verified_at;
  const cadence = CADENCE_DAYS[deal.verification_cadence] || 30;
  let suggested = deal.status;
  const reasons = [];
  let needsReview = false;

  if (deal.status === 'offline') {
    return { suggested: 'offline', needsReview: false, reasons: ['已标记下线'] };
  }

  // 1) 过期判定：结束日已过
  if (end && end < today) {
    suggested = 'possibly_expired';
    reasons.push('活动结束日 ' + end + ' 已过');
    needsReview = true;
  }

  // 2) 验证超期：距上次核验超过复核周期
  if (last) {
    const gap = daysBetween(last, today);
    if (gap > cadence) {
      reasons.push('距上次验证 ' + gap + ' 天，超过 ' + cadence + ' 天复核周期');
      needsReview = true;
      if (suggested !== 'possibly_expired') suggested = 'possibly_expired';
    }
  }

  // 3) 用户反馈（引擎注入 _recentFeedback）
  const fb = deal._recentFeedback;
  if (fb) {
    const fresh = daysBetween(fb.at, today) <= 14;
    if (fb.type === 'available' && fresh) {
      suggested = 'user_verified';
      reasons.push('近 14 天用户确认可用');
      needsReview = false;
    } else if (fb.type === 'expired' || fb.type === 'refused' || fb.type === 'changed') {
      suggested = 'possibly_expired';
      reasons.push('用户反馈：' + fb.type);
      needsReview = true;
    }
  }

  // 4) 官方长期优惠，无异常则保持
  if (deal.source_type === 'official' && deal.status === 'official_long_term' && suggested === deal.status) {
    reasons.push('官方长期政策，保持');
  }

  return { suggested, needsReview, reasons };
}

module.exports = { computeStatus, CADENCE_DAYS, todayStr, daysBetween };
