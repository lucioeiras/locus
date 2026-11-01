# Locus

**Locus** é uma biblioteca pessoal para guardar e organizar o que você quer ler, assistir, jogar, ouvir ou consultar depois. O app reúne notas, links e mídias em um board pesquisável, com tags, pastas e arquivos que ficam sob controle do usuário.

O aplicativo é desenvolvido com Expo, React Native, TypeScript e Expo Router. A biblioteca pode ficar no armazenamento local do app ou em uma pasta escolhida pelo usuário; cada item é salvo como JSON e imagens e PDFs ficam em diretórios próprios junto aos dados.

## Funcionalidades

- **Captura de conteúdo:** notas, citações, tarefas, links, artigos, vídeos do YouTube, publicações do X/Twitter e Reddit, imagens, PDFs, livros, músicas, filmes, séries e jogos.
- **Board e busca:** grade de cartões, pesquisa de texto, filtros por tipo e tag, seleção de vários itens, exclusão com opção de restaurar e visualização dos detalhes.
- **Perfil e atividade:** estatísticas da biblioteca aberta, calendário de adições com filtro do board por dia e visualização mensal com capas dos cards concluídos, filtrada por ano e tipo. O calendário de atividade reúne registros de leitura e sessão de jogo, com filtros para todos, livros ou jogos, e destaca as maiores sequências de dias consecutivos do ano. Configurações ficam acessíveis pelo perfil. A data de conclusão é registrada ao entrar em Completed; cards antigos sem essa data ficam fora do gráfico, com aviso.
- **Organização:** tags manuais e sugestões automáticas, pastas personalizadas e pastas por andamento — “Want to”, “In progress”, “Completed” e “Abandoned” — para itens compatíveis.
- **Acompanhamento e avaliações:** progresso de leitura, filmes, temporadas de séries e jogos; avaliações e comentários; registro de páginas lidas em livros e diário de jogos com data e notas opcionais, permitindo várias entradas por dia.
- **Metadados:** leitura de metadados de links, consulta de livros por ISBN, busca de música no iTunes, letras via LRCLIB, filmes via TMDB e jogos via RAWG.
- **Conteúdo relacionado:** vincule itens da biblioteca entre si.
- **Notas visuais:** o editor Milkdown/Crepe mostra formatação e imagens enquanto você escreve, sem alternar entre código e prévia. Inserir imagem fica nas opções de formatação; imagens da área de transferência usam o comando Colar do dispositivo ou Ctrl/Cmd+V no navegador. No iOS e Android, os anexos ficam em `images/`, com referências relativas no Markdown. Na web, os dados são incorporados ao texto. Os cards do board continuam usando renderização nativa. A persistência web mantém as limitações do armazenamento atual do app.
- **Arquivos:** importe imagens e PDFs, visualize PDFs e compartilhe itens usando as opções do sistema.
- **Compartilhamento para o app:** receba texto, links, imagens e PDFs de outros apps e transforme-os em cartões.
- **IA no dispositivo:** baixe modelos locais para gerar tags de notas e links ou transcrever áudios. Após o download, esses recursos podem funcionar offline.
- **Pastas de biblioteca:** use a pasta padrão do app ou escolha uma pasta disponível pelo seletor de documentos. No iOS, o módulo nativo dá suporte a acesso persistente à pasta escolhida e à integração com iCloud Drive quando o container estiver habilitado.
- **Atalhos do iOS:** controles/App Intents para iniciar a criação de itens compatíveis.

## Tipos de cartão

| Tipo | Dados e recursos disponíveis |
| --- | --- |
| Nota e citação | Texto, título, autor opcional, tags e vínculo a outro item |
| Link e artigo | URL, metadados, descrição, origem e imagem de prévia |
| YouTube | URL, título e miniatura |
| X/Twitter e Reddit | Texto e dados da publicação, com imagens quando disponíveis |
| Imagem e PDF | Arquivo importado, título e observações |
| Livro | ISBN, autores, capa, dados editoriais, progresso, avaliações e diário de leitura |
| Música | Faixa ou álbum, artista, capa e prévia quando disponível |
| Filme | Dados do catálogo TMDB, andamento, avaliação e comentários |
| Jogo | Dados do catálogo RAWG, plataformas, andamento, avaliação e diário de sessão de jogo |

Em jogos com status **Playing**, a ação de registrar sessão de jogo salva uma data e uma nota opcional. É possível registrar várias entradas no mesmo dia e editar ou excluir cada uma pelo calendário do jogo. Após concluir o jogo, o histórico continua disponível para edição e exclusão. Excluir um registro preserva sua nota vinculada na biblioteca. O calendário de atividade do perfil combina leitura e sessão de jogo; os filtros recalculam a sequência de dias conforme o tipo selecionado.

Os metadados externos dependem da disponibilidade dos serviços e, em alguns casos, de chaves de API. Os itens já salvos continuam disponíveis na biblioteca local.

## Armazenamento da biblioteca

Cada item é um arquivo `<id>.json` na raiz da biblioteca. Arquivos de mídia locais ficam em `images/` e `pdfs/`; os itens apontam para eles com caminhos relativos, como `images/capa.jpg`. As pastas personalizadas também são gravadas na biblioteca, em `.locus-folders.json`.

No iOS, as opções de armazenamento incluem a biblioteca do app, **iCloud Drive** (se o container estiver configurado) e uma pasta escolhida no app Arquivos. A biblioteca local do app pode ser acessada pelo app Arquivos em “No Meu iPhone”. O acesso persistente a pastas selecionadas usa um módulo nativo do projeto.

## Requisitos

- Bun (o repositório inclui `bun.lock`).
- Node.js compatível com a versão atual do Expo.
- Xcode para compilar e executar no simulador/dispositivo iOS; Android Studio para Android.
- Uma development build para testar funcionalidades que dependem de módulos nativos.

## Rodar localmente

```bash
git clone <URL-do-repositório> locus
cd locus
bun install
bun run start
```

O servidor Expo mostra as opções disponíveis para abrir o app. Para iniciar diretamente:

```bash
bun run ios
bun run android
bun run web
```

`bun run ios` e `bun run android` usam `expo run:*` e requerem as ferramentas nativas da plataforma. Os diretórios `ios/` e `android/` são gerados pelo Expo e não devem ser editados manualmente.

As notas usam `@milkdown/crepe` e `@milkdown/kit` na mesma versão. `NoteEditor.dom.tsx` é um componente Expo DOM: WebView nativa no iOS/Android, DOM na web. JavaScript, CSS e fontes locais são empacotados pelo Expo; não há CDN nem projeto web separado. A development build precisa ser recompilada após a remoção do editor nativo antigo para atualizar o autolinking.

Os comandos de `NoteRichTextInput` usam uma ponte com confirmação assíncrona. Salvar consulta o documento atual e aguarda importações; erros mantêm o formulário aberto. A seleção do ProseMirror acompanha edições durante a importação de imagens. `proxyDomURL` resolve anexos locais apenas para exibição, preservando seus caminhos no Markdown. A área de transferência só é consultada após um evento explícito de colagem. O último texto sincronizado restaura a sessão se a WebView recarregar; isso não salva o card automaticamente nem recupera o formulário após encerrar o app.

Abrir uma nota não altera sua sintaxe. Depois de editar, CommonMark/GFM pode normalizar marcadores e espaçamento, preservando a estrutura. HTML e fragmentos de AST não suportados são mantidos como conteúdo literal, sem executar HTML. Títulos, tags, vínculos, citações e letras continuam usando o esquema existente.

`bun run test:note-editor` exercita o motor real com ProseMirror e fixtures de compatibilidade; os testes Jest cobrem a ponte, o modal, armazenamento e os cards. O fluxo `.maestro/flows/note-visual-editor.yaml` cobre criação, formatação, salvamento e reabertura. A colagem pelo menu nativo foi verificada no simulador iOS; Android e inicialização offline em Release ainda exigem validação. Mocks e jsdom não substituem essa etapa. Consulte [o registro da migração](docs/note-editor-validation.md) para os resultados e limitações desta implementação.

### Assinatura para iPhone físico

O `app.json` define `ios.appleTeamId` como `J7V84PT2S6`, a equipe usada pelo app e pelas extensões. Para usar outra conta Apple Developer, ajuste esse campo antes de gerar o projeto nativo.

Se `bun run ios --device` falhar com `No profiles ... were found`, sincronize a configuração e abra `ios/Locus.xcworkspace` no Xcode:

```bash
bunx expo prebuild --platform ios
```

Em **Xcode > Settings > Accounts**, entre na conta Apple Developer com acesso à equipe. No projeto `Locus`, confira **Signing & Capabilities** dos três targets: `Locus`, `expo-sharing-extension` e `LocusControls`. Todos devem usar a mesma equipe e **Automatically manage signing**. A equipe precisa ter acesso aos três Bundle IDs e ao App Group `group.com.diegoeiras.locus`.

Selecione o iPhone como destino e execute o scheme `Locus` uma vez pelo Xcode para criar ou baixar os perfis de desenvolvimento. Depois, volte a usar:

```bash
bun run ios --device
```

Na CLI Expo instalada, quando os targets já têm uma equipe configurada, a chamada a `xcodebuild` pode omitir `-allowProvisioningUpdates`. Por isso, o log pode anunciar assinatura automática e ainda falhar por falta de perfis. Apenas definir o Team ID ou repetir o comando não cria os perfis nesse caso; conclua a assinatura pelo Xcode.

### Expo Go e development build

Expo Go serve para testar partes do app compatíveis com o ambiente padrão do Expo. Este projeto também usa módulos nativos locais e bibliotecas nativas, incluindo acesso persistente a pastas e execução de modelo de IA. Para testar o conjunto completo, crie uma development build com EAS:

```bash
bunx eas-cli build --profile development --platform ios
bunx eas-cli build --profile development --platform android
```

O suporte a iCloud depende também de habilitar o container `iCloud.com.diegoeiras.locus` no App ID da conta Apple Developer usada para assinar o app.

### Releases no GitHub

Um push para `main` gera um build Android (`.apk`) pelo EAS Build e publica o arquivo como asset de uma GitHub Release. Configure o secret `EXPO_TOKEN` nas configurações do repositório e vincule o projeto ao EAS com `bunx eas-cli init`; o `projectId` gerado precisa estar no `app.json`. Configure as credenciais de assinatura do Android no EAS antes do primeiro build não interativo. O projeto vinculado no painel Expo/EAS deve usar o slug `locus`, conforme o `app.json`.

O perfil `release` incrementa remotamente os números de build. O APK pode ser instalado diretamente em dispositivos Android compatíveis. A identidade nativa é `com.diegoeiras.locus`, com App Group `group.com.diegoeiras.locus`. Builds anteriores com outra identidade são instalações separadas; preferências, cache e metadados de pastas usam o namespace `locus`, sem migração automática. Arquivos de cartões em pastas escolhidas pelo usuário continuam podendo ser abertos.

## Chaves de API

As chaves abaixo são opcionais para executar o app; elas habilitam consultas aos respectivos catálogos:

| Serviço | Configuração | Uso |
| --- | --- | --- |
| RAWG | `EXPO_PUBLIC_RAWG_API_KEY` em `.env` | Busca e detalhes de jogos |
| TMDB | Chave nas configurações do app ou `EXPO_PUBLIC_TMDB_API_KEY` em `.env` | Busca e detalhes de filmes e séries |

Exemplo de `.env` local:

```dotenv
EXPO_PUBLIC_RAWG_API_KEY=sua_chave_rawg
EXPO_PUBLIC_TMDB_API_KEY=sua_chave_tmdb
```

Não versione `.env` nem credenciais. O arquivo está ignorado pelo Git. A chave TMDB inserida nas configurações é guardada no armazenamento local do app. As buscas de música usam o iTunes e letras usam LRCLIB; esses recursos não exigem uma chave configurada pelo projeto.

## Estrutura do projeto

```text
src/
  app/             Rotas e telas Expo Router
  components/      Cartões, formulários, menus e componentes visuais
  hooks/           Estado e operações compartilhadas da biblioteca
  lib/             Persistência, modelos, busca e integrações externas
modules/           Módulos Expo locais com código nativo
targets/           Alvos Apple, incluindo controles do iOS
assets/            Ícones, fontes e imagens do app
sample-library/    Biblioteca de exemplo
```

As rotas ficam em `src/app/`. Mantenha componentes e lógica reutilizável fora desse diretório para que não sejam tratados como telas pelo Expo Router.

## Ícone e splash screen

Os PNGs de marca usados pelo app ficam em `assets/images/`: `icon.png`, `icon-dark.png`, `favicon.png`, `splash-icon.png` e as camadas Android. O Android usa a camada monocromática para ícones temáticos.

O splash reutiliza o símbolo transparente sobre fundo branco ou `#09090B`, conforme o tema do sistema, com `imageWidth: 160`. O iOS usa as versões PNG clara e escura definidas em `ios.icon`; o projeto antigo do Icon Composer não é utilizado. Mudanças nesses recursos exigem regenerar os projetos nativos e fazer uma nova build. Confira o splash em uma build release.

## Verificações e comandos

```bash
bun run lint
bunx tsc --noEmit
```

Scripts disponíveis em `package.json`:

| Comando | Ação |
| --- | --- |
| `bun run start` | Inicia o Expo |
| `bun run ios` | Inicia no simulador/dispositivo iOS |
| `bun run android` | Inicia no emulador/dispositivo Android |
| `bun run web` | Inicia a versão web |
| `bun run lint` | Executa o lint do Expo |
| `bun run format` | Formata os arquivos com Prettier |

## Contribuir

1. Consulte as [Issues abertas](../../issues) e o [Project do GitHub](../../projects) para encontrar histórias, bugs e trabalho em andamento.
2. Se a ideia ainda não tiver Issue, abra uma descrevendo o problema ou a proposta, o resultado esperado e, quando ajudar, passos para reproduzir ou imagens.
3. Use o board Kanban para acompanhar a história. Mantenha a Issue ligada ao cartão do Project e atualize seu status conforme o trabalho avança. O board é a visão de fluxo; a Issue mantém contexto, discussão e critérios de conclusão.
4. Crie uma branch a partir da branch principal e faça uma alteração focada. Use mensagens de commit no padrão Conventional Commits, como `feat: add book filters` ou `fix: preserve selected folder`.
5. Antes de abrir o pull request, rode `bun run lint` e `bunx tsc --noEmit`. Inclua no PR o contexto, a Issue relacionada e evidências visuais para mudanças de interface.
6. Ao abrir o PR, referencie a Issue (por exemplo, `Closes #123`) para que o GitHub relacione o código ao trabalho e encerre a Issue quando o PR for integrado.

O repositório usa Expo Router, TypeScript e NativeWind. Siga os padrões existentes, priorize interações mobile e multiplataforma e configure comportamento nativo por `app.json` ou config plugins. Para dependências Expo, use `bunx expo install <pacote>` para selecionar uma versão compatível com o SDK do projeto.

## Planejamento: GitHub Project, Kanban e Issues

O desenvolvimento é acompanhado em um **GitHub Project** com visualização Kanban. As histórias e tarefas são registradas como **Issues** do repositório e podem ser vinculadas aos cartões do Project. Assim, a Issue concentra descrição, critérios de aceitação, conversa e referência a PRs; o board mostra em que etapa cada trabalho está.

Comece por [Issues](../../issues) para consultar ou propor trabalho e pelo [Project](../../projects) para ver o fluxo geral. Colunas, campos e filtros podem evoluir com o processo; mantenha os cartões ligados às Issues correspondentes e siga os status definidos no próprio board.

## Licença

Consulte [LICENSE](LICENSE) para os termos de uso e distribuição.

### Aparência

Em Configurações → Aparência, escolha Sistema, Claro ou Escuro. Sistema é o padrão e acompanha as mudanças do dispositivo. A preferência manual fica salva neste dispositivo e vale para todas as bibliotecas, sem modificar seus arquivos JSON.

As cores compartilhadas ficam em `src/lib/theme/`: use as classes semânticas `*-theme-*` do NativeWind ou `useAppTheme().colors` em estilos JavaScript. Modais devem usar `ThemedModal` para propagar as variáveis também nos portais web. Preserve cores próprias de mídias e controles sobre imagens.

O suporte nativo usa `userInterfaceStyle: automatic` e `expo-system-ui`. Após atualizar dependências ou configuração nativa, regenere os projetos com `bunx expo prebuild` e gere uma nova development build. O fluxo `.maestro/flows/appearance-settings.yaml` verifica a seleção e a persistência da preferência.
