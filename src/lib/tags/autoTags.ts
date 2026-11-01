import { Platform } from 'react-native';
import LocusLibraryAccessModule from '@/../modules/locus-library-access/src/LocusLibraryAccessModule';
import type { LibraryItemType } from '@/lib/library/types';

export type AutoTagInput = {
  title?: string;
  text?: string;
  note?: string;
  url?: string;
  origin?: string;
  author?: string;
  subreddit?: string;
  type?: LibraryItemType;
  /** All unique tags currently in the user's library */
  existingTags?: string[];
  /** Tags already attached to the card/form (will be omitted from suggestions) */
  currentTags?: string[];
  maxSuggestions?: number;
};

/**
 * Normalizes a tag string into a clean lowercase hyphen-separated slug.
 */
export function normalizeTag(tag: string): string {
  return tag
    .trim()
    .toLowerCase()
    .replace(/^#+/, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-') // Replace spaces/punctuation with hyphens
    .replace(/^-+|-+$/g, '');
}

/**
 * Simplified stemmer for basic plural and common suffix collapsing.
 */
function stemWord(word: string): string {
  let s = word.toLowerCase();
  if (s.endsWith('ies') && s.length > 4) {
    return s.slice(0, -3) + 'y';
  }
  if (s.endsWith('es') && s.length > 4) {
    return s.slice(0, -2);
  }
  if (s.endsWith('s') && !s.endsWith('ss') && s.length > 3) {
    return s.slice(0, -1);
  }
  return s;
}

/**
 * Calculates Levenshtein edit distance between two strings.
 */
function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Matches a candidate against user's existing tags to prevent synonym/spelling duplication.
 */
export function matchExistingTag(candidate: string, existingTags: string[]): string | null {
  const normCand = normalizeTag(candidate);
  if (!normCand) return null;
  const stemCand = stemWord(normCand);
  const plainCand = normCand.replace(/-/g, '');

  for (const existing of existingTags) {
    const normExist = normalizeTag(existing);
    if (!normExist) continue;

    // 1. Exact normalized match
    if (normCand === normExist) {
      return existing;
    }

    // 2. Plain match ignoring hyphens (e.g. 'reactnative' vs 'react-native')
    const plainExist = normExist.replace(/-/g, '');
    if (plainCand === plainExist) {
      return existing;
    }

    // 3. Stem match (e.g. 'recipes' vs 'recipe', 'tutorials' vs 'tutorial')
    if (stemCand === stemWord(normExist)) {
      return existing;
    }

    // 4. Fuzzy / Levenshtein match for longer words
    if (normCand.length >= 5 && normExist.length >= 5) {
      const dist = levenshteinDistance(normCand, normExist);
      if (dist <= 1) {
        return existing;
      }
      if (normCand.length >= 8 && normExist.length >= 8 && dist <= 2) {
        return existing;
      }
    }
  }

  return null;
}

// Common stop words to ignore when extracting fallback keywords
const STOP_WORDS = new Set([
  // English
  'about',
  'above',
  'after',
  'again',
  'against',
  'also',
  'and',
  'any',
  'are',
  'been',
  'before',
  'being',
  'below',
  'between',
  'both',
  'build',
  'building',
  'but',
  'came',
  'can',
  'come',
  'could',
  'did',
  'each',
  'even',
  'for',
  'from',
  'get',
  'getting',
  'got',
  'had',
  'has',
  'have',
  'having',
  'her',
  'here',
  'hers',
  'him',
  'his',
  'how',
  'into',
  'its',
  'just',
  'like',
  'make',
  'making',
  'many',
  'may',
  'more',
  'most',
  'much',
  'must',
  'new',
  'not',
  'now',
  'off',
  'only',
  'other',
  'our',
  'out',
  'over',
  'said',
  'same',
  'see',
  'should',
  'some',
  'still',
  'such',
  'than',
  'that',
  'the',
  'their',
  'them',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'through',
  'too',
  'under',
  'use',
  'used',
  'very',
  'want',
  'was',
  'way',
  'ways',
  'well',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'who',
  'will',
  'with',
  'would',
  'you',
  'your',
  'best',
  'good',
  'great',
  'view',
  'post',
  'show',
  'know',
  'take',
  'look',
  'first',
  'last',
  'year',
  'time',
  'things',
  'simple',
  'production',
  'release',
  'update',
  'share',
  'page',
  'home',

  // Portuguese
  'para',
  'com',
  'uma',
  'como',
  'mais',
  'por',
  'sobre',
  'este',
  'esta',
  'esse',
  'essa',
  'isso',
  'isto',
  'aquele',
  'aquela',
  'aquilo',
  'onde',
  'quando',
  'qual',
  'quem',
  'tudo',
  'nada',
  'cada',
  'outro',
  'outra',
  'muito',
  'muita',
  'pouco',
  'pouca',
  'pelo',
  'pela',
  'pelos',
  'pelas',
  'numa',
  'num',
  'dele',
  'dela',
  'deles',
  'delas',
  'está',
  'estão',
  'foram',
  'seus',
  'suas',
  'meus',
  'minhas',
  'teus',
  'tuas',
  'nossos',
  'nossas',
  'você',
  'vocês',
  'eles',
  'elas',
  'entre',
  'mesmo',
  'mesma',
  'também',
  'ainda',
  'depois',
  'antes',
  'assim',
  'aqui',
  'ali',
  'todo',
  'toda',
  'todos',
  'todas',
  'fazer',
  'feito',
  'novo',
  'nova',
  'coisas',
  'simples',
  'melhor',
  'veja',
  'saiba',

  // Web boilerplate
  'http',
  'https',
  'www',
  'com',
  'org',
  'net',
  'html',
  'index',
  'watch',
  'comments',
  'null',
  'undefined',
  'true',
  'false',
]);

// ─────────────────────────────────────────────────────────────────────────────
// SEMANTIC CONCEPT & INTENT TAXONOMY
// Macro categories and content intents (Bilingual PT-BR / EN)
// ─────────────────────────────────────────────────────────────────────────────

type SemanticConcept = {
  tag: string;
  category: 'intent' | 'domain';
  weight: number;
  synonyms: string[];
  patterns: (string | RegExp)[];
};

const SEMANTIC_TAXONOMY: SemanticConcept[] = [
  // ─── INTENTS ─────────────────────────────────────────────────────────────────
  {
    tag: 'tutorial',
    category: 'intent',
    weight: 105,
    synonyms: ['guia', 'guide', 'howto', 'how-to', 'passo-a-passo', 'dicas', 'tips', 'walkthrough'],
    patterns: [
      /\bhow to\b/i,
      /\bhow-to\b/i,
      /\bcomo fazer\b/i,
      /\bpasso a passo\b/i,
      /\bstep by step\b/i,
      /\bguide\b/i,
      /\bguia\b/i,
      /\btutorial\b/i,
      /\bwalkthrough\b/i,
      /\bgetting started\b/i,
      /\bcomeçando com\b/i,
      /\bcheat sheet\b/i,
      /\bcheatsheet\b/i,
      /\baprenda a\b/i,
      /\blearn\b/i,
      /\bdicas para\b/i,
      /\btips for\b/i,
    ],
  },
  {
    tag: 'inspiracao',
    category: 'intent',
    weight: 95,
    synonyms: ['inspiration', 'showcase', 'referencia', 'referência', 'moodboard'],
    patterns: [
      /\binspiration\b/i,
      /\binspiração\b/i,
      /\binspiracao\b/i,
      /\bshowcase\b/i,
      /\bredesign\b/i,
      /\bportfolio\b/i,
      /\bportfólio\b/i,
      /\bcreative concept\b/i,
      /\bui gallery\b/i,
      /\bmoodboard\b/i,
      /\breferência\b/i,
    ],
  },
  {
    tag: 'estudo-de-caso',
    category: 'intent',
    weight: 100,
    synonyms: ['case-study', 'postmortem', 'post-mortem', 'deep-dive'],
    patterns: [
      /\bcase study\b/i,
      /\bestudo de caso\b/i,
      /\bhow we built\b/i,
      /\bhow we scaled\b/i,
      /\bpost-mortem\b/i,
      /\bpostmortem\b/i,
      /\blessons learned\b/i,
      /\blições que aprendi\b/i,
      /\bdeep dive\b/i,
      /\bunder the hood\b/i,
      /\bpor dentro do\b/i,
    ],
  },
  {
    tag: 'ferramentas',
    category: 'intent',
    weight: 95,
    synonyms: ['tools', 'recursos', 'resources', 'toolkit', 'utilitarios'],
    patterns: [
      /\btools\b/i,
      /\bferramentas\b/i,
      /\btoolkit\b/i,
      /\bawesome-\b/i,
      /\bawesome list\b/i,
      /\bresources for\b/i,
      /\brecursos para\b/i,
      /\bboilerplates?\b/i,
      /\btemplates?\b/i,
      /\blibraries\b/i,
    ],
  },
  {
    tag: 'opiniao',
    category: 'intent',
    weight: 85,
    synonyms: ['opinion', 'ensaio', 'essay', 'reflexao', 'reflexão'],
    patterns: [
      /\bwhy i (quit|stopped|love|hate|switched)\b/i,
      /\bwhy we (built|stopped|switched)\b/i,
      /\bpor que eu\b/i,
      /\bpor que nós\b/i,
      /\bmy thoughts on\b/i,
      /\bmy take on\b/i,
      /\bminha visão\b/i,
      /\bthe death of\b/i,
      /\bo fim do\b/i,
      /\bthe future of\b/i,
      /\bo futuro do\b/i,
      /\bessay\b/i,
      /\bopinion\b/i,
      /\bopinião\b/i,
    ],
  },
  {
    tag: 'leitura',
    category: 'intent',
    weight: 90,
    synonyms: ['reading', 'livros', 'books', 'resumo', 'resenha', 'book-review'],
    patterns: [
      /\bbook summary\b/i,
      /\bresumo de livro\b/i,
      /\bbook review\b/i,
      /\bresenha\b/i,
      /\bbooks to read\b/i,
      /\blivros para ler\b/i,
      /\breading list\b/i,
      /\blista de leitura\b/i,
      /\bkindle\b/i,
      /\blivro\b/i,
      /\blivros\b/i,
    ],
  },

  // ─── THEMATIC DOMAINS ────────────────────────────────────────────────────────
  {
    tag: 'dev',
    category: 'domain',
    weight: 90,
    synonyms: [
      'desenvolvimento',
      'programacao',
      'programação',
      'code',
      'codigo',
      'código',
      'software',
      'programming',
    ],
    patterns: [
      /\bsoftware engineering\b/i,
      /\bengenharia de software\b/i,
      /\bprogram(ação|ador|ming|mer)\b/i,
      /\bdeveloper\b/i,
      /\bcoding\b/i,
      /\bgithub\b/i,
      /\bgit\b/i,
      /\bopen source\b/i,
      /\bcodebase\b/i,
      /\balgorithm\b/i,
      /\balgoritmo\b/i,
      /\bdebugging\b/i,
      /\brefactoring\b/i,
      /\bdesenvolvimento\b/i,
      /\bcódigo\b/i,
      /\bprogramar\b/i,
    ],
  },
  {
    tag: 'mobile',
    category: 'domain',
    weight: 100,
    synonyms: ['mobile-dev', 'apps', 'aplicativos', 'ios', 'android'],
    patterns: [
      /\breact native\b/i,
      /\breact-native\b/i,
      /\bexpo\b/i,
      /\bios app\b/i,
      /\bandroid app\b/i,
      /\bswiftui\b/i,
      /\bswift\b/i,
      /\bkotlin\b/i,
      /\bflutter\b/i,
      /\bapp store\b/i,
      /\btestflight\b/i,
      /\bmobile development\b/i,
      /\bflashlist\b/i,
      /\baplicativo mobile\b/i,
    ],
  },
  {
    tag: 'frontend',
    category: 'domain',
    weight: 95,
    synonyms: ['front-end', 'webdev', 'web'],
    patterns: [
      /\bfrontend\b/i,
      /\bfront-end\b/i,
      /\breact(\.js)?\b/i,
      /\bnext\.js\b/i,
      /\bnextjs\b/i,
      /\bvue(\.js)?\b/i,
      /\bsvelte\b/i,
      /\btailwind(css)?\b/i,
      /\bcss\b/i,
      /\bhtml\b/i,
      /\bjavascript\b/i,
      /\btypescript\b/i,
      /\bvite\b/i,
      /\bwebpack\b/i,
      /\bweb components\b/i,
    ],
  },
  {
    tag: 'backend',
    category: 'domain',
    weight: 95,
    synonyms: ['back-end', 'server', 'apis', 'banco-de-dados'],
    patterns: [
      /\bbackend\b/i,
      /\bback-end\b/i,
      /\bnode(\.js)?\b/i,
      /\bgolang\b/i,
      /\brustlang\b/i,
      /\brust\b/i,
      /\bpython\b/i,
      /\bpostgres(ql)?\b/i,
      /\bmysql\b/i,
      /\bsqlite\b/i,
      /\bredis\b/i,
      /\bmongodb\b/i,
      /\bgraphql\b/i,
      /\brest api\b/i,
      /\bgrpc\b/i,
      /\bmicroservices\b/i,
    ],
  },
  {
    tag: 'ai',
    category: 'domain',
    weight: 105,
    synonyms: [
      'ia',
      'artificial-intelligence',
      'inteligencia-artificial',
      'llm',
      'machine-learning',
    ],
    patterns: [
      /\b(artificial intelligence|inteligência artificial)\b/i,
      /\b(machine learning|deep learning)\b/i,
      /\b(llm|llms)\b/i,
      /\b(chatgpt|gpt-4|gpt-4o|o1|claude|gemini|openai|anthropic)\b/i,
      /\b(ollama|local models?|llama|mistral)\b/i,
      /\b(agentic|ai agents?|agentes de ia)\b/i,
      /\b(rag|vector database|embeddings?)\b/i,
      /\b(prompt engineering|prompts)\b/i,
      /\bapple intelligence\b/i,
    ],
  },
  {
    tag: 'design',
    category: 'domain',
    weight: 95,
    synonyms: ['ui-design', 'ui-ux', 'visual-design'],
    patterns: [
      /\bui(\/ux)?\b/i,
      /\bux design\b/i,
      /\bfigma\b/i,
      /\bdesign system\b/i,
      /\btypography\b/i,
      /\btipografia\b/i,
      /\bwireframe\b/i,
      /\bprotótipo\b/i,
      /\bprototype\b/i,
      /\binterface design\b/i,
      /\bdribbble\b/i,
      /\bdesign visual\b/i,
    ],
  },
  {
    tag: 'produto',
    category: 'domain',
    weight: 90,
    synonyms: ['product', 'gestao-de-produto', 'product-management'],
    patterns: [
      /\bproduct management\b/i,
      /\bproduct manager\b/i,
      /\bgestão de produto\b/i,
      /\bproduct roadmap\b/i,
      /\bmvp\b/i,
      /\buser onboarding\b/i,
      /\bchurn rate\b/i,
      /\bproduct discovery\b/i,
    ],
  },
  {
    tag: 'startup',
    category: 'domain',
    weight: 90,
    synonyms: ['startups', 'saas', 'empreendedorismo', 'founders'],
    patterns: [
      /\bstartups?\b/i,
      /\bsaas\b/i,
      /\bmicro-saas\b/i,
      /\bbootstrapped\b/i,
      /\bventure capital\b/i,
      /\bseed round\b/i,
      /\bfounders?\b/i,
      /\bfundador(es)?\b/i,
      /\bempreendedorismo\b/i,
      /\bmrr\b/i,
      /\barr\b/i,
    ],
  },
  {
    tag: 'negocios',
    category: 'domain',
    weight: 85,
    synonyms: ['business', 'marketing', 'vendas', 'gestao'],
    patterns: [
      /\bbusiness strategy\b/i,
      /\bestratégia de negócios\b/i,
      /\bmarketing digital\b/i,
      /\bgrowth marketing\b/i,
      /\bmonetization\b/i,
      /\bmonetização\b/i,
      /\bvendas\b/i,
      /\bnegócios\b/i,
    ],
  },
  {
    tag: 'produtividade',
    category: 'domain',
    weight: 90,
    synonyms: ['productivity', 'organizacao', 'organização', 'segundo-cerebro', 'second-brain'],
    patterns: [
      /\bproductivity\b/i,
      /\bprodutividade\b/i,
      /\btime management\b/i,
      /\bgestão de tempo\b/i,
      /\bworkflow\b/i,
      /\bfluxo de trabalho\b/i,
      /\bsecond brain\b/i,
      /\bsegundo cérebro\b/i,
      /\bhabits?\b/i,
      /\bhábitos?\b/i,
      /\bdeep work\b/i,
      /\bfoco\b/i,
      /\brotina\b/i,
      /\bnotion\b/i,
      /\bobsidian\b/i,
    ],
  },
  {
    tag: 'financas',
    category: 'domain',
    weight: 90,
    synonyms: ['finance', 'finanças', 'investimentos', 'investing', 'economia'],
    patterns: [
      /\bfinan(ces|ças)\b/i,
      /\binvest(ing|ments|imentos)\b/i,
      /\bstocks\b/i,
      /\bações\b/i,
      /\bcrypto(currency)?\b/i,
      /\bcripto(moedas)?\b/i,
      /\bbitcoin\b/i,
      /\bethereum\b/i,
      /\bdividend(s|os)\b/i,
      /\beconom(y|ia)\b/i,
      /\bdinheiro\b/i,
      /\borçamento\b/i,
    ],
  },
  {
    tag: 'carreira',
    category: 'domain',
    weight: 85,
    synonyms: ['career', 'trabalho', 'vagas', 'jobs'],
    patterns: [
      /\bcareer\b/i,
      /\bcarreira\b/i,
      /\bjob interview\b/i,
      /\bentrevista de emprego\b/i,
      /\bresume\b/i,
      /\bcurrículo\b/i,
      /\bremote work\b/i,
      /\btrabalho remoto\b/i,
      /\bvagas?\b/i,
      /\bsalário\b/i,
      /\bsalary\b/i,
    ],
  },
  {
    tag: 'viagem',
    category: 'domain',
    weight: 90,
    synonyms: ['travel', 'viagens', 'turismo', 'ferias'],
    patterns: [
      /\bviage(m|ns)\b/i,
      /\btravel\b/i,
      /\bturismo\b/i,
      /\broteiro de viagem\b/i,
      /\bhotel\b/i,
      /\bhospedagem\b/i,
      /\bpassagens aéreas\b/i,
      /\bvoo\b/i,
      /\bférias\b/i,
      /\bdestinos?\b/i,
    ],
  },
  {
    tag: 'receitas',
    category: 'domain',
    weight: 95,
    synonyms: ['culinaria', 'culinária', 'cooking', 'gastronomia', 'comida'],
    patterns: [
      /\breceitas?\b/i,
      /\brecipes?\b/i,
      /\bculinária\b/i,
      /\bgastronomia\b/i,
      /\bcooking\b/i,
      /\bingredientes\b/i,
      /\bmodo de preparo\b/i,
      /\bprato\b/i,
      /\bsobremesa\b/i,
      /\balmoço\b/i,
      /\bjantar\b/i,
    ],
  },
  {
    tag: 'saude',
    category: 'domain',
    weight: 90,
    synonyms: ['saúde', 'health', 'fitness', 'treino', 'bem-estar'],
    patterns: [
      /\bsaúde\b/i,
      /\bsaude\b/i,
      /\bhealth\b/i,
      /\bfitness\b/i,
      /\btreino\b/i,
      /\bworkout\b/i,
      /\bacademia\b/i,
      /\bsono\b/i,
      /\bsleep\b/i,
      /\bnutrição\b/i,
      /\bnutrition\b/i,
      /\bdieta\b/i,
      /\bbem-estar\b/i,
    ],
  },
  {
    tag: 'filmes',
    category: 'domain',
    weight: 90,
    synonyms: ['cinema', 'series', 'séries', 'movies'],
    patterns: [
      /\bfilmes?\b/i,
      /\bmovies?\b/i,
      /\bcinema\b/i,
      /\bséries?\b/i,
      /\bseries\b/i,
      /\bstreaming\b/i,
      /\bnetflix\b/i,
      /\btrailer\b/i,
    ],
  },
  {
    tag: 'musica',
    category: 'domain',
    weight: 90,
    synonyms: ['música', 'music', 'album', 'playlist'],
    patterns: [
      /\bmúsicas?\b/i,
      /\bmusicas?\b/i,
      /\bmusic\b/i,
      /\bálbum\b/i,
      /\bplaylist\b/i,
      /\bspotify\b/i,
      /\bcanção\b/i,
      /\bbanda\b/i,
    ],
  },
  {
    tag: 'esportes',
    category: 'domain',
    weight: 90,
    synonyms: ['sports', 'futebol'],
    patterns: [
      /\besportes?\b/i,
      /\bsports?\b/i,
      /\bfutebol\b/i,
      /\bcampeonato\b/i,
      /\bcopa\b/i,
      /\bbasquete\b/i,
      /\bnba\b/i,
      /\bcorrida\b/i,
    ],
  },
  {
    tag: 'games',
    category: 'domain',
    weight: 90,
    synonyms: ['jogos', 'gaming', 'videogames'],
    patterns: [
      /\bgames?\b/i,
      /\bjogos?\b/i,
      /\bgaming\b/i,
      /\bplaystation\b/i,
      /\bxbox\b/i,
      /\bnintendo\b/i,
      /\bsteam\b/i,
    ],
  },
  {
    tag: 'noticias',
    category: 'domain',
    weight: 85,
    synonyms: ['news', 'atualidades', 'jornal'],
    patterns: [
      /\bnotícias?\b/i,
      /\bnoticias?\b/i,
      /\bnews\b/i,
      /\bjornal\b/i,
      /\bmanchete\b/i,
      /\bacontecimento\b/i,
    ],
  },
  {
    tag: 'estudos',
    category: 'domain',
    weight: 85,
    synonyms: ['educacao', 'educação', 'learning', 'estudo'],
    patterns: [
      /\bestudos?\b/i,
      /\beducação\b/i,
      /\beducacao\b/i,
      /\bcurso\b/i,
      /\bfaculdade\b/i,
      /\buniversidade\b/i,
      /\bconcurso\b/i,
    ],
  },
  {
    tag: 'ciencia',
    category: 'domain',
    weight: 85,
    synonyms: ['ciência', 'science', 'pesquisa'],
    patterns: [
      /\bciência\b/i,
      /\bciencia\b/i,
      /\bscience\b/i,
      /\bfísica\b/i,
      /\bbiologia\b/i,
      /\bneurociência\b/i,
      /\bastronomia\b/i,
      /\bespaço\b/i,
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// HIGH-SIGNAL SPECIFIC TECH, BRAND & TOOL ENTITIES
// ─────────────────────────────────────────────────────────────────────────────
const HIGH_SIGNAL_ENTITIES: Record<string, RegExp> = {
  'react-native': /\breact[\s-]native\b/i,
  react: /\breact(\.js)?\b/i,
  typescript: /\btypescript\b/i,
  javascript: /\bjavascript\b/i,
  python: /\bpython\b/i,
  swift: /\bswift(ui)?\b/i,
  kotlin: /\bkotlin\b/i,
  rust: /\brust(lang)?\b/i,
  golang: /\bgolang\b/i,
  nextjs: /\bnext(\.js)?\b/i,
  vue: /\bvue(\.js)?\b/i,
  tailwind: /\btailwind(css)?\b/i,
  expo: /\bexpo\b/i,
  figma: /\bfigma\b/i,
  docker: /\bdocker\b/i,
  postgres: /\bpostgres(ql)?\b/i,
  graphql: /\bgraphql\b/i,
  apple: /\bapple\b/i,
  openai: /\bopenai\b/i,
  notion: /\bnotion\b/i,
  obsidian: /\bobsidian\b/i,
  google: /\bgoogle\b/i,
  microsoft: /\bmicrosoft\b/i,
  netflix: /\bnetflix\b/i,
  spotify: /\bspotify\b/i,
  amazon: /\bamazon\b/i,
  stripe: /\bstripe\b/i,
  supabase: /\bsupabase\b/i,
};

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN CONCEPT MAPPINGS
// ─────────────────────────────────────────────────────────────────────────────
const DOMAIN_CONCEPT_MAP: Record<string, string[]> = {
  'github.com': ['dev', 'github'],
  'gitlab.com': ['dev'],
  'figma.com': ['design', 'figma'],
  'dribbble.com': ['design', 'inspiracao'],
  'behance.net': ['design', 'inspiracao'],
  'medium.com': ['leitura', 'artigo'],
  'substack.com': ['leitura', 'newsletter'],
  'dev.to': ['dev', 'artigo'],
  'news.ycombinator.com': ['dev', 'startup'],
  'stackoverflow.com': ['dev'],
  'youtube.com': ['video', 'youtube'],
  'youtu.be': ['video', 'youtube'],
  'reddit.com': ['reddit'],
  'x.com': ['tweet'],
  'twitter.com': ['tweet'],
  'instagram.com': ['instagram'],
  'tiktok.com': ['tiktok', 'video'],
  'linkedin.com': ['carreira'],
  'producthunt.com': ['produto', 'startup'],
  'spotify.com': ['musica'],
  'wikipedia.org': ['artigo', 'pesquisa'],
  'nytimes.com': ['noticias'],
  'bbc.com': ['noticias'],
  'theverge.com': ['tecnologia', 'noticias'],
  'techcrunch.com': ['startup', 'tecnologia'],
  'wired.com': ['tecnologia'],
  'g1.globo.com': ['noticias'],
  'ge.globo.com': ['esportes', 'futebol'],
  'uol.com.br': ['noticias'],
  'folha.uol.com.br': ['noticias'],
};

// Generic hosts to ignore when extracting brand tag from domain
const IGNORED_DOMAINS = new Set([
  'com',
  'org',
  'net',
  'io',
  'co',
  'app',
  'dev',
  'br',
  'gov',
  'edu',
  'aws',
  'cdn',
  'api',
  'linktr',
  'bit',
  'tinyurl',
  't',
  'goo',
]);

/**
 * Extracts domain-based tags and url path clues directly from a URL.
 */
function extractDomainAndPathTags(urlStr: string): string[] {
  if (!urlStr) return [];
  const tags: string[] = [];

  try {
    const parsed = new URL(/^https?:\/\//i.test(urlStr) ? urlStr : `https://${urlStr}`);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');

    // 1. Direct domain map lookup
    for (const [domain, mappedTags] of Object.entries(DOMAIN_CONCEPT_MAP)) {
      if (hostname === domain || hostname.endsWith(`.${domain}`)) {
        tags.push(...mappedTags);
      }
    }

    // 2. Extract clean company/service brand name from domain (e.g., stripe.com -> stripe)
    const hostParts = hostname.split('.');
    if (hostParts.length >= 2) {
      const baseDomain = hostParts[hostParts.length - 2];
      if (
        baseDomain &&
        baseDomain.length >= 3 &&
        !IGNORED_DOMAINS.has(baseDomain) &&
        !tags.includes(baseDomain)
      ) {
        tags.push(baseDomain);
      }
    }

    // 3. Reddit subreddit from path: /r/([a-zA-Z0-9_]+)
    const subMatch = parsed.pathname.match(/\/r\/([a-zA-Z0-9_]+)/i);
    if (subMatch && subMatch[1]) {
      const sub = subMatch[1].toLowerCase();
      if (!tags.includes(sub)) {
        tags.push(sub);
      }
    }
  } catch {
    // ignore URL parse errors
  }

  return tags;
}

/**
 * Resolves a detected concept to the user's preferred tag if they have a matching synonym or existing tag.
 */
function resolveConceptToUserTag(concept: SemanticConcept, existingTags: string[]): string {
  // 1. Direct match on concept tag
  const directMatch = matchExistingTag(concept.tag, existingTags);
  if (directMatch) return directMatch;

  // 2. Check if user already uses one of the synonym tags
  for (const syn of concept.synonyms) {
    const synMatch = matchExistingTag(syn, existingTags);
    if (synMatch) return synMatch;
  }

  // 3. Fall back to standard canonical concept tag
  return concept.tag;
}

/**
 * Calls Apple's on-device NLTagger via NativeModule if running on iOS.
 */
function getNativeEntities(text: string): string[] {
  if (Platform.OS !== 'ios') return [];
  try {
    if (
      LocusLibraryAccessModule &&
      typeof LocusLibraryAccessModule.extractEntitiesAndTags === 'function'
    ) {
      return LocusLibraryAccessModule.extractEntitiesAndTags(text) || [];
    }
  } catch {
    // fallback gracefully
  }
  return [];
}

const FILE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'heic',
  'svg',
  'bmp',
  'tiff',
  'ico',
  'mp4',
  'mov',
  'avi',
  'mkv',
  'mp3',
  'wav',
  'pdf',
  'json',
  'txt',
  'zip',
]);

/**
 * Detects whether a string is a machine identifier, UUID piece, hex hash, or camera filename.
 */
export function isGibberishOrMachineId(word: string): boolean {
  const clean = word.toLowerCase().replace(/^#+/, '').trim();
  if (!clean || clean.length < 2) return true;

  // File extension
  if (FILE_EXTENSIONS.has(clean)) return true;

  // Pure digits or starts with pure digits
  if (/^\d+$/.test(clean)) return true;

  // Camera / screenshot prefixes like img123, dsc0045, pxl2023, screenshot, photo1
  if (/^(img|dsc|pxl|screenshot|screen|photo|pic|image)[-_0-9]*$/i.test(clean)) return true;

  // Hexadecimal strings (e.g. 5a3e, 4b02, c18e6624, 61019d2bd546)
  if (clean.length >= 4 && /^[0-9a-f]+$/i.test(clean) && /\d/.test(clean) && /[a-f]/i.test(clean)) {
    return true;
  }

  // UUID patterns or chunks
  if (/^[0-9a-f]{4,}-[0-9a-f]{4,}/i.test(clean)) return true;

  // Mixed alphanumeric with high digit ratio (e.g. ab12cd34)
  const digits = clean.match(/\d/g)?.length || 0;
  if (digits >= 2 && digits / clean.length >= 0.35) return true;

  // No vowels for words > 2 chars, unless known tech acronym (css, npm, sql, xml, php, etc.)
  const vowels = clean.match(/[aeiouyáéíóúâêîôûãõàèìòù]/i);
  if (!vowels && clean.length > 2 && !['css', 'npm', 'sql', 'xml', 'php', 'rss'].includes(clean)) {
    return true;
  }

  return false;
}

/**
 * Fallback extraction: extracts prominent topic nouns/proper names from title or text
 * strictly when no other concepts were found, ensuring tags are never completely empty.
 */
function extractFallbackTopics(text: string): string[] {
  if (!text) return [];
  const words = text.match(/[\p{L}\p{N}]{3,}/gu) || [];
  const seen = new Set<string>();
  const candidates: string[] = [];

  for (const w of words) {
    const clean = w.toLowerCase();
    if (STOP_WORDS.has(clean)) continue;
    if (isGibberishOrMachineId(clean)) continue;
    if (seen.has(clean)) continue;
    seen.add(clean);
    candidates.push(clean);
    if (candidates.length >= 3) break;
  }

  return candidates;
}

/**
 * Primary auto-tagging generator:
 * 1. Evaluates user's personal existing tags against the content (highest priority).
 * 2. Classifies content into conceptual ideas and intents (Semantic Idea Taxonomy).
 * 3. Identifies high-signal domain entities (e.g. React Native, TypeScript, Figma, Apple).
 * 4. Extracts immediate domain, platform, and subreddit context from URL.
 * 5. Uses iOS NLTagger for proper organizations and locations.
 * 6. Guarantees safety fallback so users never end up with 0 tags.
 */
export function generateAutoTags(input: AutoTagInput): string[] {
  const {
    title = '',
    text = '',
    note = '',
    url = '',
    origin = '',
    author = '',
    subreddit = '',
    type,
    existingTags = [],
    currentTags = [],
    maxSuggestions = 4,
  } = input;

  const currentSet = new Set(currentTags.map(normalizeTag));
  const candidateScores = new Map<string, number>();

  function addCandidate(rawTag: string, score: number) {
    if (!rawTag) return;
    const norm = normalizeTag(rawTag);
    if (!norm || norm.length < 2 || norm.length > 30) return;
    if (STOP_WORDS.has(norm)) return;
    if (isGibberishOrMachineId(norm)) return;

    // Check if it matches an existing user tag
    const matched = matchExistingTag(rawTag, existingTags);
    const finalTag = matched ?? norm;

    if (currentSet.has(normalizeTag(finalTag))) return;

    const currentScore = candidateScores.get(finalTag) || 0;
    const userBonus = matched ? 45 : 0;
    candidateScores.set(finalTag, Math.max(currentScore, score + userBonus));
  }

  const combinedContent =
    `${title} ${text} ${note} ${origin} ${author} ${subreddit} ${url}`.toLowerCase();
  const titleAndNote = `${title} ${note}`.toLowerCase();

  // 1. Direct Content Matching against User's Personal Existing Tags (Top Priority)
  for (const existing of existingTags) {
    const normExisting = normalizeTag(existing);
    if (!normExisting || normExisting.length < 2) continue;
    const plain = normExisting.replace(/-/g, ' ');

    const escaped = plain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');

    if (regex.test(combinedContent)) {
      addCandidate(existing, 130);
    }
  }

  // 2. Semantic Idea & Intent Classification
  for (const concept of SEMANTIC_TAXONOMY) {
    let matchedScore = 0;

    for (const pattern of concept.patterns) {
      if (typeof pattern === 'string') {
        if (titleAndNote.includes(pattern.toLowerCase())) {
          matchedScore = Math.max(matchedScore, concept.weight + 20);
        } else if (combinedContent.includes(pattern.toLowerCase())) {
          matchedScore = Math.max(matchedScore, concept.weight);
        }
      } else {
        if (pattern.test(titleAndNote)) {
          matchedScore = Math.max(matchedScore, concept.weight + 20);
        } else if (pattern.test(combinedContent)) {
          matchedScore = Math.max(matchedScore, concept.weight);
        }
      }
    }

    if (matchedScore > 0) {
      const resolvedTag = resolveConceptToUserTag(concept, existingTags);
      addCandidate(resolvedTag, matchedScore);
    }
  }

  // 3. High-Signal Tech & Entity Extraction
  for (const [entityTag, pattern] of Object.entries(HIGH_SIGNAL_ENTITIES)) {
    if (pattern.test(titleAndNote)) {
      const matched = matchExistingTag(entityTag, existingTags) ?? entityTag;
      addCandidate(matched, 100);
    } else if (pattern.test(combinedContent)) {
      const matched = matchExistingTag(entityTag, existingTags) ?? entityTag;
      addCandidate(matched, 80);
    }
  }

  // 4. URL & Domain Context (Instant, works even without page title)
  if (url) {
    const urlTags = extractDomainAndPathTags(url);
    for (const ut of urlTags) {
      addCandidate(ut, 75);
    }
  }

  // Subreddit context
  if (subreddit) {
    const cleanSub = subreddit.replace(/^r\//i, '').toLowerCase().trim();
    if (cleanSub) {
      addCandidate(cleanSub, 85);
    }
  }

  // Media types
  if (type === 'youtube') {
    addCandidate('video', 60);
    addCandidate('youtube', 60);
  } else if (type === 'tweet') {
    addCandidate('tweet', 60);
  } else if (type === 'reddit') {
    addCandidate('reddit', 60);
  } else if (type === 'pdf') {
    addCandidate('pdf', 60);
    addCandidate('document', 60);
  } else if (type === 'book') {
    addCandidate('book', 60);
    addCandidate('reading', 50);
  } else if (type === 'music') {
    addCandidate('music', 70);
  } else if (type === 'movie') {
    addCandidate('movie', 70);
  } else if (type === 'tvshow') {
    addCandidate('tvshow', 70);
    addCandidate('cinema', 60);
  } else if (type === 'game') {
    addCandidate('games', 70);
    addCandidate('gaming', 60);
  }

  // 5. iOS NLTagger Named Entities (Organizations, Locations, Personal Names)
  const fullTextToAnalyze = `${title}\n${text}\n${note}`.trim();
  if (fullTextToAnalyze) {
    const nativeEntities = getNativeEntities(fullTextToAnalyze);
    for (const entity of nativeEntities) {
      addCandidate(entity, 80);
    }
  }

  // 6. Safety Fallback: if zero tags were matched, extract top significant topic terms
  if (candidateScores.size === 0) {
    const fallbacks = extractFallbackTopics(title || note || text);
    for (const fb of fallbacks) {
      addCandidate(fb, 50);
    }
  }

  // Sort candidates by score descending
  const sorted = Array.from(candidateScores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag);

  return sorted.slice(0, maxSuggestions);
}

/**
 * Asynchronous auto-tagging that uses the On-Device LLM (Qwen 2.5 via llama.rn)
 * when available on the device, and gracefully falls back to instant heuristics.
 */
export async function generateAutoTagsAsync(input: AutoTagInput): Promise<string[]> {
  try {
    const { localLlamaEngine } = await import('@/lib/ai/localLlamaEngine');
    if (localLlamaEngine.isAvailable()) {
      const llmTags = await localLlamaEngine.generateTags({
        title: input.title,
        text: input.text,
        note: input.note,
        url: input.url,
        existingTags: input.existingTags,
        maxTags: input.maxSuggestions ?? 4,
      });
      if (llmTags && llmTags.length > 0) {
        return llmTags;
      }
    }
  } catch (e) {
    console.warn('Local LLM inference failed, falling back to heuristics:', e);
  }

  return generateAutoTags(input);
}
