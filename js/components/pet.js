export function buildPetCompanionPanel(dashboard, authState) {
  if (!authState.apiAvailable || authState.user?.role !== 'owner') return '';

  const state = dashboard?.userState || {};
  const totalRecords = Number(state.totalRecords || 0);
  const streak = Number(state.currentStreakDays || 0);
  const longest = Number(state.longestStreakDays || 0);
  const level = Math.max(1, Number(state.level || 1));
  const xp = Math.max(0, Number(state.xp || 0));
  const streakBreakPenalty = Math.max(0, Number(state.streakBreakPenalty || 0));
  const currentLevelXp = (level - 1) * 100;
  const nextLevelXp = level * 100;
  const progress = Math.max(0, Math.min(100, ((xp - currentLevelXp) / 100) * 100));
  const recordsToNext = Math.max(1, Math.ceil((nextLevelXp - xp) / 10));
  const hasRecordedToday = Boolean(dashboard?.hasRecordedToday);
  const stage = getStage(level, streak);

  return `
    <section class="pet-panel" id="pet-companion-panel" aria-label="宠物激励体系">
      <div class="pet-portrait" aria-hidden="true">
        <div class="pet-aura"></div>
        <div class="pet-body ${hasRecordedToday ? 'is-fed' : ''}">
          <span class="pet-ear left"></span>
          <span class="pet-ear right"></span>
          <span class="pet-eye left"></span>
          <span class="pet-eye right"></span>
          <span class="pet-mouth"></span>
        </div>
      </div>
      <div class="pet-content">
        <div class="domain-card-topline">
          <span>成长伙伴</span>
          <span>Lv.${level}</span>
        </div>
        <h2>${escapeHtml(stage.title)}</h2>
        <p>${escapeHtml(hasRecordedToday ? stage.fedText : stage.waitingText)}</p>
        <div class="pet-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progress)}">
          <span style="width: ${progress}%"></span>
        </div>
        <div class="pet-stats">
          <span>${xp} XP</span>
          <span>连续 ${streak} 天</span>
          <span>最长 ${longest} 天</span>
          <span>累计 ${totalRecords} 次</span>
          ${streakBreakPenalty ? `<span>断档 -${streakBreakPenalty} XP</span>` : ''}
        </div>
        <div class="pet-next">
          ${hasRecordedToday
            ? `今天已喂养。再完成约 ${recordsToNext} 次记录或复盘升级。`
            : streakBreakPenalty
              ? `连续中断会扣减经验。今天补上一条记录或复盘，就从这里重新接上。`
              : `今天写一条记录或每日复盘，伙伴获得经验并点亮连续天数。`}
        </div>
      </div>
    </section>
  `;
}

function getStage(level, streak) {
  if (level >= 8 || streak >= 30) {
    return {
      title: '稳定经营期',
      fedText: '你已经把记录变成了一种稳定经营能力，今天也续上了。',
      waitingText: '它在等你补上一句真实状态，保持这条长期线不断。'
    };
  }

  if (level >= 4 || streak >= 7) {
    return {
      title: '成长加速期',
      fedText: '今天的记录已经让它继续成长，节奏正在变稳。',
      waitingText: '今天还差一次喂养。写一句，就能把节奏接回来。'
    };
  }

  return {
    title: '幼苗启动期',
    fedText: '今天已经喂养成功。小小一条，也算系统在长大。',
    waitingText: '它还在等今天第一口养分。写一句真实状态就够。'
  };
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}
