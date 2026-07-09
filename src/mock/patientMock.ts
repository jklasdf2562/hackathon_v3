// Mock 患者/判定层 —— LLM 不可用时的剧本+关键词兜底。
import type { CaseCard, GameState } from '../game/types';

// —— Mock 判定层:按病例卡里配置的关键词匹配 hidden_ask ——
export function mockInterpretAsk(c: CaseCard, text: string): string | null {
  for (const h of c.hiddenAsk) {
    if (h.keywords?.some((k) => text.includes(k))) return h.key;
  }
  return null;
}

export interface ReplyCtx {
  kind: 'greeting' | 'ask' | 'turn_end' | 'op_result';
  question?: string;
  revealedKey?: string | null;
  recentEvents?: string[];
}

// 按 hp 区间调整说话状态:hp 高正常;<50 说话带喘;critical 断断续续
function styleByHp(s: GameState, normal: string, gasping: string, critical: string): string {
  if (s.phase === 'critical' || s.hp <= 30) return critical;
  if (s.hp < 50) return gasping;
  return normal;
}

export function mockPatientReply(c: CaseCard, s: GameState, ctx: ReplyCtx): string {
  if (c.caseId === 'appendicitis_01') return wangReply(s, ctx);
  return genericReply(c, s, ctx);
}

// —— 王大爷专属剧本 ——
function wangReply(s: GameState, ctx: ReplyCtx): string {
  switch (ctx.kind) {
    case 'greeting':
      return '大夫……俺这肚子有点不得劲,还有点恶心。没啥大事吧?俺寻思忍忍就过去了,是俺家那口子非拉俺来的。可别给俺开一堆贵检查啊。';
    case 'op_result':
      return '(哼哼着缓过神)大夫……刚才这一下……俺这身子骨自己有数,你给俺说道说道?';
    case 'turn_end':
      return styleByHp(
        s,
        '哎,大夫,俺这肚子还是不得劲……',
        '大夫……(喘)俺这肚子越来越疼了……有点顶不住……',
        '疼……疼得厉害……大夫……(声音断断续续,几乎叫不应)'
      );
    case 'ask': {
      const q = ctx.question ?? '';
      if (ctx.revealedKey === 'migrating_pain') {
        return styleByHp(
          s,
          '你别说,还真怪了。昨儿是肚脐眼那块疼,今儿倒挪到右边小肚子这块了,一按更疼。俺寻思是不是岔气了?',
          '(喘)一开始……是肚脐那儿疼……现在挪到右边下头了……一动就钻心地疼……',
          '右边……右下边……疼……(蜷缩着,说不出整句)'
        );
      }
      if (ctx.revealedKey === 'anorexia') {
        return styleByHp(
          s,
          '打昨儿晚上就没胃口,一口饭没吃。俺家那口子做的红烧肉俺都没动筷,你说怪不怪。',
          '(喘)吃不下……昨晚到现在……一口没吃……闻着味儿就恶心……',
          '不……不想吃……(摆摆手)'
        );
      }
      if (/反跳|按压|压痛|白细胞|化验|指标|血象|B超|超声/.test(q)) {
        return '这俺哪儿懂啊大夫,俺也说不上来。你是大夫你看着办,不过能不查就不查哈,那玩意贵。';
      }
      const generic = [
        '就是肚子不得劲,恶心,别的没啥大毛病。俺身子骨硬朗着呢,年轻时候扛麻袋的。',
        '没啥没啥,就是有点难受。大夫你给开点便宜药得了,别整那些花里胡哨的检查。',
        '俺也说不好,反正就是不舒坦。要不……你给俺开两片药俺回家躺躺?',
      ];
      return styleByHp(
        s,
        generic[q.length % generic.length],
        '(喘)大夫……俺是真有点顶不住了……你快给看看吧……',
        '(几乎说不出话)难受……难受……'
      );
    }
  }
}

// —— 通用剧本:按病例卡数据生成(其余病例的兜底) ——
function genericReply(c: CaseCard, s: GameState, ctx: ReplyCtx): string {
  switch (ctx.kind) {
    case 'greeting':
      return `(声音很小)医生……我${c.volunteered.join(',还')}……可能没什么大事,不好意思麻烦你……`;
    case 'op_result':
      return '(虚弱地睁开眼)……医生……刚才那下……我感觉有点说不上来……';
    case 'turn_end':
      return styleByHp(
        s,
        `(不安地搓手)医生……我还是${c.volunteered[0]}……`,
        `(呼吸急促)医生……越来越紧了……我有点怕……`,
        '(嘴唇发紫,说不出整句)……喘……不上……'
      );
    case 'ask': {
      if (ctx.revealedKey) {
        const sym = c.hiddenAsk.find((h) => h.key === ctx.revealedKey);
        return styleByHp(
          s,
          `(犹豫了一下,小声)其实……${sym?.desc}……早该说的,对不起……`,
          `(喘着气)……${sym?.desc}……刚才没好意思说……`,
          `(艰难地挤出几个字)……${sym?.desc?.slice(0, 12)}……`
        );
      }
      return styleByHp(
        s,
        '(摇摇头)我也说不清楚……就是很不舒服……',
        '(呼吸急促)说不上来……医生,我是不是很严重……',
        '(几乎说不出话)……'
      );
    }
  }
}
