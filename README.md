# Financeiro pessoal

Controle financeiro pessoal que roda no navegador — desktop e celular. Registra
lançamentos, projeta **contas recorrentes** e acompanha **compras parceladas**.

**No ar:** https://fernandosergiofilho.github.io/financeiro-pessoal/

Cada envio para a branch principal roda os testes e, se passarem, publica sozinho — pela
branch `gh-pages`, sem exigir nenhuma configuração manual no repositório.

## Instalar no celular

O app é instalável: abre em tela cheia, com ícone próprio, e **funciona sem internet**.

- **Android (Chrome):** abra o endereço, toque nos três pontinhos e em *Instalar aplicativo*
  (ou *Adicionar à tela inicial*).
- **iPhone (Safari):** abra o endereço, toque no botão de compartilhar e em
  *Adicionar à Tela de Início*.

Sem conexão o app continua abrindo e aceitando lançamentos — eles ficam guardados no
aparelho.

Nesta primeira etapa tudo roda **local**, sem servidor e sem cadastro: os dados ficam
guardados no próprio navegador. A camada de dados já foi desenhada para virar online sem
mexer na interface (veja *Caminho para a versão online*).

## Testar sem instalar nada

```bash
npm run build:single
```

Gera um único `financeiro.html` (~270 kB) com CSS e JavaScript embutidos. Abra com dois
cliques: funciona offline, sem servidor e sem instalar nada. É o jeito mais rápido de
experimentar no computador.

Duas ressalvas que valem saber antes de começar a digitar de verdade:

- Os lançamentos ficam **no navegador daquele aparelho**, não dentro do arquivo. O
  arquivo é só o programa: levá-lo para outro computador leva o app, não o histórico.
  Para mudar de aparelho, use **Ajustes → Baixar backup** e, do outro lado,
  **Restaurar backup**.
- Mover ou renomear o arquivo **não** perde nada no Chrome, que guarda o armazenamento de
  todos os arquivos locais no mesmo lugar (verificado). Em outros navegadores pode variar,
  e o backup é a garantia.
- Se o navegador recusar salvar (janela anônima, por exemplo), o app avisa no topo em vez
  de perder os dados em silêncio.

**Não há sincronização entre aparelhos.** Lançar no celular e no notebook cria dois
históricos separados, e restaurar um backup substitui o que estiver do outro lado, não
mistura. Enquanto for local, vale eleger um aparelho como o oficial. É exatamente esse
problema que a versão online resolveria.

No celular esse caminho é frágil: abrir um arquivo baixado varia muito entre Android e
iPhone, e o iOS costuma bloquear o armazenamento nesse modo. Para testar no telefone,
prefira o `npm run dev` abaixo, acessando pelo Wi-Fi local.

## Rodando o projeto

```bash
npm install
npm run dev      # abre em http://localhost:5173
```

O servidor já escuta na rede local, então dá para abrir **no celular pelo mesmo Wi-Fi**:
use o endereço `Network` que o comando imprime (algo como `http://192.168.0.10:5173`).

Outros comandos:

| Comando | O que faz |
|---|---|
| `npm test` | Testes do domínio e a simulação de uso |
| `npm run typecheck` | Checagem de tipos |
| `npm run build` | Build de produção em `dist/` |
| `npm run preview` | Serve o build para conferência |
| `npm run verificar` | **Tudo**: tipos, testes, os dois builds e as simulações no navegador |

Para experimentar sem digitar nada: **Ajustes → Carregar dados de exemplo**.

## O que dá para fazer

- **Lançamentos** — criar, editar e apagar entradas, saídas e transferências entre contas
  próprias. Cada um é *efetivado* (já aconteceu) ou *previsto* (ainda vai acontecer), e o
  ✓ da lista confirma um previsto.
- **Contas recorrentes** — aluguel, salário, assinaturas e mensalidades. Frequência
  semanal, mensal ou anual, com intervalo (a cada 2 meses, por exemplo) e término opcional
  por data ou por número de cobranças. Os vencimentos aparecem sozinhos nos meses
  seguintes.
- **Compras parceladas** — informe o total e o número de parcelas; cada parcela vira um
  lançamento nos meses seguintes, somando **exatamente** o total.
- **Período à escolha** — dia, mês, trimestre, ano, um intervalo de datas ou **Tudo**. As
  setas andam no grão escolhido, e o painel e a lista de lançamentos acompanham. "Tudo" é o
  que mostra o lançamento marcado para daqui a oito meses ou o de dois anos atrás — antes
  eles não apareciam em canto nenhum.
- **Painel** — saldo de hoje, entradas, saídas, sobra, **o saldo caminhando ao longo do
  período** (o já acontecido em linha cheia, o previsto tracejado), **o que mudou em relação
  ao período anterior** por categoria, gastos por categoria, entradas × saídas nos últimos
  doze meses e saldo por conta. Alerta de contas vencidas que continuam como previstas.
- **Contas e categorias** editáveis, com cores e ícones.

Cadastrar as três coisas — avulso, parcelado e recorrente — acontece num lugar só, o botão
**+ Novo lançamento**. As abas *Fixas* e *Parcelas* são de consulta: para corrigir ou
apagar uma delas, clique na linha.
- **Backup e planilha** — exportar os lançamentos do mês em CSV (abre direto no Excel e no
  LibreOffice em português), **importar de volta** a mesma planilha com linhas acrescentadas,
  baixar um backup completo em JSON e restaurá-lo depois.
- **Juntar cadastros repetidos** — se a mesma conta ou categoria aparecer duas vezes,
  Ajustes avisa e junta tudo num clique: os lançamentos passam para o cadastro que fica.
- **Contas agrupadas por banco** — um banco tem conta corrente *e* cartão, e agora eles
  aparecem juntos numa linha só, com o subtotal do grupo no painel. Os dois saldos continuam
  separados de propósito: o dinheiro que está na conta e a fatura que se deve são coisas
  diferentes, e somá-las daria um número que não existe em lugar nenhum. Ao cadastrar
  "Nubank cartão" com um "Nubank" já existente, o app oferece o agrupamento — oferece, nunca
  aplica sozinho.
- **Cópias automáticas** — o app guarda sozinho o estado anterior de tempos em tempos, e
  **sempre no instante antes de uma perda grande** (um "apagar tudo" sem querer, uma
  importação torta, uma sincronização que trouxe a carteira vazia por cima da cheia). São
  duas cópias com propósitos diferentes: a de rotina, que se sobrescreve, e a de queda, que
  só outra queda substitui. Em Ajustes dá para ver, baixar e restaurar cada uma.
- **Importar o CSV do banco** — o extrato ou a fatura que o Nubank (e os outros) exportam.
  O app descobre sozinho o separador e as colunas de data, descrição e valor, compara com o
  que você já lançou e mostra linha por linha o que é novo, o que já existe e o que ficou em
  dúvida — o que parece repetido vem **desmarcado**. A categoria vem sugerida pelo seu
  próprio histórico: se "Uber" sempre foi Transporte, "UBER *TRIP 8823" chega como
  Transporte.
- **Aviso de lançamento repetido** — ao cadastrar um avulso, uma compra parcelada ou uma
  conta recorrente, o app procura o que já existe com o mesmo valor e a mesma descrição e
  pergunta antes de gravar. A busca é conservadora de propósito: alarme falso ensina a
  ignorar o aviso.
- **Apagar conta sem mistério** — em vez de "tem lançamentos" e um arquivamento calado, o
  app diz *o que* aponta para ela ("2 lançamentos e 1 conta recorrente"), leva você até
  esses lançamentos e oferece passar tudo para outra conta antes de apagar.
- Tema claro/escuro (ou o do sistema), navegação lateral no desktop e barra inferior com
  botão flutuante no celular.

## Como está organizado

```
src/
  domain/    regras puras, sem React: datas, dinheiro, recorrência, parcelas, somas
  data/      persistência (repositório), formato salvo, dados iniciais, import/export
  state/     reducer puro + store React + seletores memoizados
  ui/        telas, componentes e estilos
```

O `domain/` não importa nada de React nem do navegador — é onde estão os testes e onde
mora a parte que precisa estar certa.

### Três decisões que valem explicar

**Contas recorrentes são projetadas, não gravadas.** A regra é a fonte da verdade; as
ocorrências futuras são calculadas na hora (`domain/recurrence.ts`) e só viram lançamento
gravado quando você confirma ou edita aquele mês. Assim, mudar o valor do aluguel é uma
edição em um lugar só, e não uma varredura por centenas de lançamentos futuros. Apagar uma
ocorrência isolada grava uma exceção na regra, para ela não reaparecer.

**Compras parceladas são gravadas de imediato.** Aqui o total é finito e conhecido no
cadastro, então as N parcelas viram lançamentos reais ligados pela compra — dá para editar
a parcela de março sozinha. A divisão joga o resto nas primeiras parcelas, como a
maquininha: R$ 100,00 em 3× = 33,34 + 33,33 + 33,33.

**A planilha vai e volta pela mesma porta.** O CSV exportado pode ser reenviado depois de
receber linhas novas no Excel, e reenviá-lo **sem mexer não duplica nada** — cada linha leva
uma coluna `ID`, e a importação pula as que o aplicativo já tem. Ocorrências de contas
recorrentes saem sem ID e são ignoradas na volta: quem as gera é a regra, todo mês, e
trazê-las como lançamentos soltos criaria uma cópia ao lado da projeção. A leitura é separada
da gravação — o resumo mostra quantas linhas são novas, quantas já existiam e o que deu
problema em qual linha, e só então você confirma. A data é aceita nos dois formatos, porque
reformatar a coluna é a primeira coisa que o Excel faz ao abrir e salvar o arquivo.

A coluna `Parcela` diz duas coisas, e a forma distingue: **`10x`** cria uma compra parcelada
(o `Valor` da linha é o total, e as dez parcelas nascem a partir da data), enquanto **`3/10`**
é como a exportação escreve uma parcela que já existe — na volta ela é ignorada, porque
recriá-la duplicaria a compra inteira.

**Dinheiro em centavos, datas como texto.** Valores são inteiros em centavos (nada de
`0.1 + 0.2`), e datas são strings `YYYY-MM-DD` com aritmética própria — usar `Date` traria
fuso horário para dentro do domínio e faria 31/01 virar 30/01 a oeste de Greenwich. Somar
mês preserva o dia quando ele existe (31/01 + 1 mês = 28/02, mas 31/01 + 3 meses = 30/04).

### Cores

A paleta de categorias e dos gráficos foi validada para daltonismo (separação em CVD,
contraste e faixa de luminosidade) nos temas claro e escuro. O validador é rodado, não
estimado: foi ele que reprovou verde/vermelho no gráfico divergente — ΔE 5.7 no tema
escuro, abaixo do piso — e o par virou azul/laranja, que passa com folga nos dois temas.
De qualquer forma, quem carrega o sentido ali é o lado do eixo, não a cor. As cores são guardadas como
*nome de posição na paleta* (`'blue'`), não como hex, então o tema escuro usa outro passo
da mesma família sem tocar nos dados.

## Sincronizar entre aparelhos

O app pode funcionar em dois modos, e o segundo é opcional:

- **Só local** (sem configuração): os lançamentos ficam no navegador do aparelho, sem
  login nenhum. É o modo do `financeiro.html` de arquivo único.
- **Com carteira compartilhada**: o app **exige login** — a primeira tela é a de entrar — e
  duas pessoas, cada uma com sua conta, enxergam e editam os mesmos lançamentos.

Continua **local-first** nos dois casos: o app grava no navegador e funciona offline; a
sincronização acontece por trás, e o que for lançado sem sinal sobe quando a conexão volta.

### Ligar a sincronização

1. Crie um projeto no [supabase.com](https://supabase.com) (plano gratuito).
2. No **SQL Editor**, rode o arquivo [`supabase/schema.sql`](supabase/schema.sql).
3. Em **Settings → API**, copie a *Project URL* e a chave **`anon`** para o
   `.env.production` (veja `.env.example` para o formato). A chave `service_role` não
   entra aqui nem em lugar nenhum: ela ignora todas as políticas de acesso.

4. Em **Authentication → Sign In / Providers → Email**, desligue **Confirm email**.

### Quem entra, e quem não entra

O endereço publicado é aberto: qualquer um pode abri-lo. O que decide o acesso é isto:

- Sem entrar, a primeira tela é a de login. Nenhuma página do app é montada.
- Quem se cadastra fica **pendente** e vê uma tela de espera. Não enxerga nem grava nada.
- O **dono** — a primeira pessoa a entrar, que ganhou a carteira — libera ou recusa cada
  pedido em **Ajustes → Pedidos de acesso**, e pode tirar o acesso de alguém depois.

A tela é só a aparência disso. A regra mora nas políticas de acesso do banco: sem ser
membro da carteira, o servidor não devolve nem aceita um único registro, mesmo para quem
chame a API por fora do aplicativo. É por isso que o `supabase/test/` exercita justamente
esses casos.

O login é por senha, e não por link enviado no e-mail, por um motivo prático: o serviço de
e-mail que vem com o Supabase envia no máximo duas mensagens por hora e **só entrega para
endereços da organização do projeto** — as demais são descartadas sem erro nenhum. Numa
carteira compartilhada, a segunda pessoa nunca receberia o link.

Pelo mesmo motivo, avisar por e-mail que alguém pediu acesso depende de um serviço de fora.
Isso é **opcional** e fica em [`supabase/email-aviso.sql`](supabase/email-aviso.sql), com o
passo a passo. Sem ele, os pedidos continuam aparecendo em Ajustes.

### Senha esquecida

Há dois caminhos, e a diferença entre eles importa:

- **"Trocar senha", em Ajustes** — para quem ainda está logado em algum aparelho. A sessão
  ativa já prova que a conta é sua, então não pede a senha antiga nem manda e-mail nenhum.
  **É o caminho garantido**, e resolve o caso mais comum: esqueci no computador, mas o
  celular continua logado.
- **"Esqueci minha senha", na tela de entrar** — para quem não está logado em lugar nenhum.
  Manda um link por e-mail, e aí esbarra na mesma limitação de sempre: o remetente embutido
  do Supabase entrega pouquíssimas mensagens por hora e só para endereços da organização do
  projeto. Para valer para qualquer endereço, configure um **SMTP próprio** em
  *Project Settings → Authentication → SMTP Settings* (o mesmo serviço do `email-aviso.sql`
  serve). Sem isso, o link pode simplesmente não chegar.

O aplicativo **não tem como** trocar a senha de alguém sem uma dessas duas provas de
identidade. Fazer isso exigiria a chave `service_role`, que ignora todas as políticas de
acesso — colocá-la no JavaScript entregue ao navegador anularia a proteção inteira. Por isso
o último recurso é o painel do Supabase, em *Authentication → Users*.

> Uma armadilha que vale conhecer: **não apague o usuário** no painel para "recomeçar".
> `wallet_members.user_id` tem `on delete cascade`, então apagar o usuário derruba junto a
> participação e a condição de dono. A carteira continuaria existindo, uma conta nova cairia
> em "pendente" e não sobraria ninguém para aprovar.

### Por que a chave fica versionada, e não num "secret"

A chave `anon` é **pública por natureza**: ela é compilada dentro do JavaScript que o site
entrega a qualquer visitante. Dá para conferir depois de um `npm run build`:

```bash
grep -c "eyJhbGciOi" dist/assets/index-*.js   # a chave está lá
```

Guardá-la num secret do GitHub não a esconderia de ninguém — só daria uma falsa sensação
de segurança, além de exigir configuração manual a cada clone. Quem realmente protege os
lançamentos são as políticas de acesso em `supabase/schema.sql`.

### Como a atualização chega

O site é um PWA: um service worker guarda os arquivos para o app abrir offline. O preço
disso é que a versão nova não aparece sozinha na página já aberta — e a configuração
anterior (`autoUpdate`) tornava isso pior do que parece: o worker novo assumia, mas o
JavaScript em execução continuava sendo o antigo, então a mudança só aparecia no **segundo**
recarregamento, sem nada na tela explicando.

Agora o app usa `registerType: 'prompt'` e mostra um aviso com um botão. A troca acontece
quando a pessoa manda — recarregar sozinho poderia apagar um lançamento digitado pela metade.

### Testar as telas no navegador

Um defeito de renderização não aparece em teste de unidade: ele derruba a árvore do React e
a página fica em branco. O caso que motivou este teste foi apagar a data com o teclado —
pelo mouse não dava, porque o seletor só produz datas completas.

```bash
npm run build:single && npm run test:telas
```

### Simulação de uso

`src/data/carteira-exemplo.ts` monta a carteira do caso real — **duas pessoas, três contas
correntes, quatro cartões, um investimento**, doze meses de histórico, quatro parcelamentos,
cinco contas recorrentes e transferências. Ela é usada por dois lugares, de propósito o
mesmo arquivo:

- `src/simulacao.test.ts` percorre o caminho inteiro sem navegador — cadastrar, editar e
  apagar as três formas de lançamento, conferir os totais por período, sincronizar entre
  dois aparelhos — e tem uma seção **"não volta a acontecer"** com um caso nomeado para cada
  defeito já corrigido;
- `test-navegador/simulacao.mjs` abre o app de verdade num Chromium com essa carteira,
  em nove larguras e nos dois temas, e confere que nada estoura para os lados, que o seletor
  de período funciona em todos os grãos e que apagar uma conta faz o que promete.

```bash
npm run build:single && npm run test:simulacao
```

Toda alteração passa por `npm run verificar` antes de virar deploy, e o workflow do GitHub
Actions roda as duas simulações antes de publicar: uma versão que não sobrevive a elas não
chega ao ar. Cada regressão da lista foi vista **falhando** contra o código de antes da
correção — um teste que nunca falhou não prova nada.

### Testar o banco de verdade

O `supabase/schema.sql` é exercitado contra um Postgres real, como quatro pessoas
diferentes — o dono, um aprovado, um pendente e um estranho. O que ele prova, e é o
motivo de existir: quem não foi liberado **não lê nem grava nada**, não se aprova sozinho
e não consegue entrar editando a tabela de pedidos.

```bash
supabase/test/testar-schema.sh supabase/schema.sql
```

E, porque o banco de verdade já tem dados, a migração também é exercitada: colar o schema
novo por cima do antigo tem que manter os membros, os lançamentos, e o dono como dono —
se o papel não fosse preenchido, ninguém poderia aprovar mais ninguém.

```bash
supabase/test/testar-migracao.sh supabase/test/schema-anterior.sql supabase/schema.sql
```

O ambiente simulado **não instala a extensão pgcrypto**, de propósito: foi assim que um
convite quebrado passou despercebido uma vez, porque o Postgres não valida o corpo de uma
função ao criá-la e o erro só aparecia no clique.

Dentro do app há ainda **Ajustes → Verificar configuração**, que testa cada peça contra o
seu projeto e diz qual falta.

**Confirme as permissões você mesmo**, antes de publicar e sempre que mexer no schema:

```bash
npm run verificar-seguranca
```

O script usa a mesma chave pública, sem estar logado, e tenta ler e gravar os seus dados.
Ele distingue "o servidor negou" de "não cheguei ao servidor": numa rede com proxy ou com
a URL errada ele avisa que **nada foi verificado**, em vez de dar um falso sinal verde.

### Como o conflito é resolvido

Por registro, o mais recente vence. Se cada pessoa editar um lançamento diferente, os dois
sobrevivem. Se as duas editarem o mesmo, fica a alteração mais recente. Uma exclusão
propaga para os outros aparelhos, mas uma edição *posterior* à exclusão ressuscita o
registro — é mais fácil apagar de novo do que redigitar algo que sumiu sozinho.

## Caminho para outra nuvem

`src/data/repository.ts` define a interface `FinanceRepository` (`load`, `save`, `clear`),
hoje implementada por `LocalStorageRepository`. A interface é assíncrona de propósito: a
interface gráfica já trata carregamento e escrita como operações que podem demorar e
falhar.

Para colocar no ar, o essencial é:

1. Escrever um `HttpRepository` que fale com a API, e passá-lo ao `FinanceProvider`
   (`<FinanceProvider repository={...}>` — o ponto de troca já existe em `main.tsx`).
2. Subir uma API com autenticação e o mesmo formato de `FinanceData`.
3. Resolver o que acontece quando o mesmo dado muda em dois aparelhos — o campo `updatedAt`
   de cada registro já está gravado com esse fim.

O build é estático (`npm run build` gera `dist/`), então hospedar a interface é só servir
arquivos. Como já é responsivo e funciona em tela de celular, dá para instalar como app
pela própria opção "adicionar à tela de início" do navegador.

## Onde os dados ficam

Em `localStorage`, na chave `financeiro-pessoal`, apenas neste navegador e neste
computador. Nada é enviado para lugar nenhum. Limpar os dados do site apaga tudo — por
isso existe o botão de backup em Ajustes.
