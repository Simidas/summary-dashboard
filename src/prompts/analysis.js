export function buildAnalysisPrompt(context) {
  const payload = JSON.stringify(context, null, 2);
  const scopeInstruction = buildScopeInstruction(context.scopeType);

  return `
你是一个个人经营分析助手。用户把记录作为事实数据，你需要把事实变成经营判断和下一步。

请输出严格 JSON，不要输出 Markdown，不要输出代码块。

通用原则：
- 必须基于输入事实，不要编造。
- 先接住状态，再给判断和建议。
- 鼓励要具体，不能空泛鸡汤。
- 下一步必须小到 25 分钟内能启动。
- 健康相关只做状态观察，不做医疗诊断。
- 任何分析最终都要落到一个更小的下一步。

分析层级要求：
${scopeInstruction}

输出 JSON 结构：
{
  "title": "分析标题，12字以内",
  "headline": "一句最重要判断",
  "summary": "2-4句话，说明这些数据反映了什么，以及下一步如何收束",
  "facts": ["事实1", "事实2", "事实3"],
  "state": ["状态观察1", "状态观察2"],
  "progress": ["推进或成果1", "推进或成果2"],
  "blockers": ["卡点或风险1", "卡点或风险2"],
  "patterns": ["反复模式1", "需要继续观察的模式2"],
  "affirmation": "一句具体肯定",
  "nextActions": [
    {
      "text": "25分钟内能启动的行动",
      "reason": "为什么是这个行动",
      "priority": "high | medium | low",
      "domain": "work | side_business | life | content",
      "size": "25min"
    }
  ],
  "watchItems": ["需要继续观察的事项"],
  "pauseSuggestions": ["建议暂缓或放下的事项"]
}

输入数据：
${payload}
`.trim();
}

function buildScopeInstruction(scopeType) {
  if (scopeType === 'daily') {
    return [
      '- Daily 是每日收束，不是流水账。',
      '- 必须回答：今天发生了什么、今天状态如何、推进了什么、卡在哪里、明天第一步是什么。',
      '- 输出里 facts/state/progress/blockers/nextActions 都要尽量填充。',
      '- affirmation 要让用户感到今天的记录有价值。'
    ].join('\n');
  }

  if (scopeType === 'domain') {
    return [
      '- 场景分析要回答：这个场景最近经营得怎么样。',
      '- 必须覆盖最近发生了什么、进展、卡点、反复模式和下一步。',
      '- 如果是生活场景，要关注情绪、关系、健康和能量恢复。',
      '- 如果是主业，要关注效率、能力沉淀、业务理解和反复卡点。',
      '- 如果是副业，要关注产品方向、验证进展、项目推进和商业化线索。',
      '- 如果是内容场景，要关注选题、素材、输出节奏和可复用观点。'
    ].join('\n');
  }

  return [
    '- 周期分析要看趋势、成果、模式和下一阶段策略。',
    '- 不要只复述数据，要给出经营判断。'
  ].join('\n');
}
