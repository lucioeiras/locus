# Migração das notas para Milkdown/Crepe

Implementação: 28/10/2026. Expo 57, Milkdown/Crepe e kit 7.23.0.

## Verificações concluídas

- `bun run test:note-editor`: passou com o motor real em jsdom. Cobre formatação, histórico, tarefas, aspas, seleção mapeada durante importações, múltiplas imagens, falha de armazenamento, colagem, fallback explícito da ponte e salvamento imediato.
- Fixtures em `src/tests/lib/noteEditor/fixtures/`: Markdown existente, listas aninhadas, tarefas, tabelas existentes, links/imagens por referência, alt/título, caminhos relativos, código e HTML literal. Abrir mantém a fonte original; editar preserva o conteúdo após normalização. HTML não é executado.
- Jest completo: **409 passaram, 4 falharam**, 76 suítes. As quatro falhas preexistentes estão registradas abaixo. A suíte focada do editor, imagens, fontes e contexto da biblioteca passou.
- `bun run lint`: passou.
- `bunx tsc --noEmit`: passou.
- `git diff --check`: passou.
- Exportação de produção: `EXPO_NO_DOTENV=1 bunx expo export --platform all --output-dir /tmp/locus-milkdown-final` passou para iOS, Android e web. O documento DOM, JavaScript, CSS e fontes fazem parte dos assets locais; não há CDN do editor. Recursos opcionais do Crepe são importados estaticamente, evitando menus não solicitados e fragmentação do bundle DOM nativo.
- Build iOS de desenvolvimento: passou e instalou no iPhone 17 Pro com iOS 26.4.1. Foi necessário executar o instalador de artefatos do `llama.rn` e reinstalar os pods: a instalação local inicialmente não tinha `rnllama/rn-llama.h`. Nenhum patch novo foi aplicado ao módulo.

## Verificação no iOS real do simulador

Pelo Device Hub, no app instalado:

1. Criar nota e digitar texto no editor visual.
2. Abrir formatação e transformar o parágrafo em H1.
3. Inserir uma foto de exemplo do simulador pelo seletor de fotos.
4. Copiar a imagem pelo menu de contexto da WebView, criar outro parágrafo e usar **Paste** no menu de edição do próprio iOS.
5. Salvar, conferir os dois anexos no board nativo e reabrir a nota no editor visual.
6. Conferir, sem imprimir o conteúdo do card, que o JSON contém duas referências relativas a `images/`, os dois arquivos existem e o `.md` foi criado.

O texto e a imagem não salvos também sobreviveram ao recarregamento do componente DOM durante a validação. Teclado, rodapé centralizado, barra de formatação e cursor foram inspecionados visualmente. O acessório padrão da WebView foi desativado para manter apenas os controles do app. O motor usa margens explícitas de rolagem para manter o cursor acima do rodapé.

## Verificação no navegador

A exportação de produção foi servida localmente com rotas estáticas e os cabeçalhos necessários ao SQLite. Foram verificados digitação visual, transformação em H1, colagem de uma imagem PNG com Ctrl/Cmd+V, exibição imediata e histórico de desfazer/refazer. O `src` exibido é um `data:image/`, confirmando a estratégia web de dados incorporados. A consulta de tags não é executada enquanto a biblioteca ainda não está pronta. A persistência da biblioteca web mantém suas limitações existentes e não foi ampliada nesta migração.

## Falhas anteriores, separadas da migração

| Suíte                                                 | Falha observada                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------- |
| `src/tests/components/modals/NewVideoModal.test.tsx`  | Teste procura o botão `Cancel`; a interface fornece `Close`.              |
| `src/tests/components/modals/NewTvShowModal.test.tsx` | Expectativa do controle `Save TV show` não corresponde à interface atual. |
| `src/tests/lib/theme/theme.test.tsx`                  | Teste de troca de tema procura `Cancel`.                                  |
| `src/tests/components/modals/NewFolderModal.test.tsx` | Teste de cancelamento procura `Cancel`.                                   |

## Pendências de aceite mobile

A migração **ainda não está inteiramente validada para mobile**:

- Android: SDK ausente neste ambiente. Build, teclado, seletores e **Colar** pelo menu nativo precisam ser executados em aparelho ou emulador Android.
- Inicialização e reabertura completamente offline em uma build Release ainda precisam de teste no dispositivo; o teste iOS acima usa a development build com Metro local. As referências e os arquivos persistidos foram verificados, mas isso não equivale a testar a inicialização de produção sem rede.
- Maestro não está instalado. O fluxo `.maestro/flows/note-visual-editor.yaml` foi acrescentado, mas não executado. Preserva `clearState` e depende de uma build com `EXPO_PUBLIC_E2E=true`.
- Falhas de ponte, inicialização lenta, recuperação de WebView, troca de tema e localização têm cobertura automatizada; ainda é recomendável complementar com interrupção real do processo da WebView e alternância de temas nos dois sistemas.

## Ajustes de empacotamento encontrados na validação

A exportação revelou dois problemas de configuração já presentes no app: faltava habilitar `.wasm` no Metro para o SQLite web, e as chamadas funcionais de fotos estavam importadas da entrada de classes do SDK 57. A configuração WASM foi adicionada e o import de fotos passou para `expo-media-library/legacy`, preservando as chamadas existentes. O editor não altera o esquema JSON nem a estratégia de persistência web da biblioteca.

Na hospedagem web, o SQLite requer os cabeçalhos `Cross-Origin-Opener-Policy: same-origin` e `Cross-Origin-Embedder-Policy: credentialless`, além de servir as rotas estáticas sem a extensão `.html`. Um servidor HTTP simples sem esses cabeçalhos não permite abrir o cache SQLite do app.
