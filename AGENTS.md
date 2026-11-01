# Instruções para agentes

## Sobre o aplicativo

Locus é uma biblioteca pessoal, offline-first, para salvar e organizar notas, links, publicações, arquivos e mídias que o usuário quer consultar depois. O projeto usa Expo SDK 57, React Native 0.86, TypeScript, Expo Router e NativeWind. Priorize interações mobile, desempenho e compatibilidade entre iOS, Android e web.

O board permite pesquisar e filtrar cartões por tipo, tag e andamento. Há pastas personalizadas, notas e citações relacionadas a outros cartões, detalhes e avaliações de mídias, diário de leitura, compartilhamento com o app, importação de imagens/PDFs e geração opcional de tags com IA local. Metadados podem vir de Google Books/Open Library/BrasilAPI, iTunes/LRCLIB, TMDB, RAWG e páginas web; resultados externos dependem de rede e, em alguns casos, de chaves de API.

Cada cartão da biblioteca é salvo como um arquivo JSON. Imagens e PDFs ficam em diretórios próprios da biblioteca e os cartões guardam referências relativas. A biblioteca pode usar o armazenamento do app ou uma pasta escolhida pelo usuário. O acesso persistente a pastas e outras integrações nativas dependem de módulos Expo locais.

Consulte `README.md` para informações de configuração, armazenamento, serviços externos e desenvolvimento. Nunca leia, imprima ou versione valores de `.env` ou outras credenciais.

## Estrutura importante

- `src/app/`: telas e rotas Expo Router. Cada arquivo de tela é uma rota; `_layout.tsx` define os navegadores. Mantenha componentes, hooks e lógica reutilizável fora desta pasta.
- `src/components/`: cartões, formulários, menus, prévias e componentes visuais.
- `src/hooks/`: estado compartilhado e operações usadas pelas telas, incluindo `useLibrary`.
- `src/lib/library/`: tipos e operações centrais da biblioteca, parsing, persistência, cache, metadados e organização.
- `src/lib/`: integrações e regras de livros, jogos, filmes, música, tags e IA.
- `src/tests/`: testes Jest. Recrie aqui a estrutura relevante de `src/components/` ou `src/lib/`; mantenha os testes centralizados nesta árvore, sem espalhá-los junto ao código de produção.
- `.maestro/flows/`: cenários E2E mobile em Maestro.
- `.github/workflows/pull-request-checks.yml`: check de pull request que instala dependências e executa testes, lint e typecheck.
- `modules/` e `targets/`: módulos nativos locais e alvos Apple. Entenda as instruções e os usos existentes antes de alterar código nativo.

Use Expo Router para navegação e importe `Link`, `router` e `useLocalSearchParams` de `expo-router`. Não crie arquivos que não sejam telas em `src/app/`.

## Testes e validação

- O usuário autorizou novamente a execução automática de testes em 30/10/2026, após corrigir o problema de travamento do computador. A restrição anterior de executar testes somente mediante pedido explícito foi revogada; siga as orientações de validação abaixo.
- Toda funcionalidade ou correção de comportamento deve incluir ou atualizar testes automatizados adequados. Cubra o comportamento observável, incluindo casos inválidos, limites e estados de erro relevantes.
- Para lógica pura, prefira testes unitários de entradas e saídas. Para componentes, teste interações, acessibilidade, estados e callbacks com React Native Testing Library. Para fluxos do usuário que cruzam telas ou persistência, acrescente um fluxo Maestro em `.maestro/flows/` quando viável.
- Coloque testes Jest em `src/tests/`, espelhando o domínio do código testado. Exemplos: `src/tests/components/cards/` para `src/components/cards/` e `src/tests/lib/library/` para `src/lib/library/`.
- Rode primeiro a suíte relacionada à mudança. Exemplo: `bun run test -- --runInBand src/tests/lib/library/parse.test.ts`. Se a mudança afetar vários módulos ou fluxos, rode a suíte completa: `bun run test -- --ci --runInBand`.
- Antes de concluir mudanças no app, rode `bun run lint` e `bunx tsc --noEmit`. A Action de pull request também executa essas verificações e a suíte Jest completa.
- Use `bun run test:coverage` quando estiver avaliando cobertura. A configuração Jest atual coleta cobertura de `src/components/`; o percentual resultante não representa cobertura de todo o código em `src/`.
- Rode E2E com `bun run test:e2e` somente quando Maestro e um simulador/dispositivo compatível estiverem disponíveis. Os fluxos precisam de um app instalado. Para build de teste, o perfil EAS `e2e` define `EXPO_PUBLIC_E2E=true`, que inicializa a biblioteca local `E2E Library` quando não há uma fonte salva. Os fluxos Maestro usam `clearState` para começar sem estado salvo; mantenha esse comportamento restrito ao perfil E2E.
- Os testes que consultam APIs externas ou abrem seletores nativos devem usar mocks ou fixtures previsíveis quando possível. Não dependa de serviços ao vivo, chaves pessoais ou escolhas manuais de arquivos para uma suíte CI repetível. Documente limitações quando um fluxo nativo não puder ser automatizado no ambiente atual.

## Expo, React Native e dependências

As APIs do Expo mudam entre versões. Antes de escrever código que use APIs Expo, EAS ou React Native:

1. Confira a versão principal de `expo` em `package.json`.
2. Consulte a documentação correspondente em `https://docs.expo.dev/versions/v<major>.0.0/`.
3. Para outras dúvidas Expo, leia `https://docs.expo.dev/llms.txt` e siga os links para a documentação específica. Não responda com base apenas em memória.

Este repositório usa Bun (`bun.lock`). Use `bun` e `bunx`, não `npm`, `yarn`, `pnpm` ou `npx`.

```bash
bun ci                         # instalação reproduzível pelo bun.lock
bunx expo install <pacote>     # dependências Expo compatíveis com o SDK
bun run start                  # inicia o Expo
bun run ios                    # executa expo run:ios
bun run android                # executa expo run:android
bun run web                    # inicia a versão web
bun run lint                   # lint
bunx tsc --noEmit              # typecheck
bunx expo-doctor               # diagnóstico de dependências e configuração
bunx expo install --fix        # corrige versões incompatíveis com o SDK
```

Prefira módulos Expo recomendados a dependências de terceiros e confira os módulos já usados antes de adicionar outro pacote. Uma dependência com código nativo requer uma development build; Expo Go não inclui módulos nativos arbitrários.

Se `ios/` e `android/` não existirem, são gerados pelo Continuous Native Generation: não os crie manualmente. Quando comportamento nativo puder ser configurado com `app.json` ou config plugins, prefira essa configuração. Este repositório já contém esses diretórios; antes de alterá-los, confira `README.md`, o histórico e os módulos/config plugins locais para entender se a mudança precisa ser persistida neles ou no código-fonte do módulo.

Use EAS para builds, assinatura, envio e atualizações OTA. Em projetos Bun, rode comandos EAS como `bunx eas-cli <comando>`. Documentação: `https://docs.expo.dev/eas/index.md`.

## Dados, serviços e segurança

- Preserve o funcionamento offline e o controle do usuário sobre os arquivos da biblioteca.
- Trate dados lidos de arquivos JSON como entrada não confiável; use o parsing e validações existentes em `src/lib/library/parse.ts`.
- Preserve compatibilidade com os tipos de cartão definidos em `src/lib/library/types.ts` e com bibliotecas existentes. Mudanças de esquema precisam de compatibilidade, migração ou tratamento explícito.
- Não registre dados pessoais, conteúdo de cartões ou segredos em logs. Não adicione chaves de API ao código, testes, fixtures ou workflows.
- Ao adicionar ou alterar integração externa, trate indisponibilidade, respostas inválidas e ausência de chave sem quebrar o acesso aos dados locais.
- Configure comportamento de plataforma por `app.json`, config plugins ou módulos nativos próprios conforme apropriado; verifique iOS e Android quando a mudança envolver capacidades nativas.

## Estilo de trabalho

Faça mudanças focadas e siga os padrões existentes. Evite dependências novas se o projeto já oferecer uma solução. Para mudanças de interface, considere estados de carregamento, vazio e erro, alvos de toque, acessibilidade e telas pequenas. Não declare a tarefa concluída sem informar o que mudou e quais verificações foram executadas, incluindo qualquer limitação relevante.
