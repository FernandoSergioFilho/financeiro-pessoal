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
  próprias. Todo lançamento nasce **a pagar**; a caixa de seleção da lista marca e desmarca
  como pago, nos dois sentidos. Nada no app decide sozinho que algo foi pago — nem parcela
  com data vencida, que antes nascia quitada e escondia dívida.
- **Contas recorrentes** — aluguel, salário, assinaturas e mensalidades. Frequência
  semanal, mensal ou anual, com intervalo (a cada 2 meses, por exemplo) e término opcional
  por data ou por número de cobranças. Os vencimentos aparecem sozinhos nos meses
  seguintes.
- **Compras parceladas** — informe o total e o número de parcelas; cada parcela vira um
  lançamento nos meses seguintes, somando **exatamente** o total. Nenhuma nasce paga,
  inclusive as de data já vencida.
- **Filtros nas listas** — Lançamentos, Fixas e Parcelas usam a mesma busca: texto (por
  palavra solta, fora de ordem, sem acento), conta, categoria, mais o recorte próprio de
  cada tela (ativas/pausadas, em aberto/quitadas). Os indicadores do topo acompanham o
  filtro: o número lá em cima fala da mesma coisa que a lista embaixo.
- **Período à escolha** — dia, mês, trimestre, ano, um intervalo de datas ou **Tudo**. As
  setas andam no grão escolhido, e o painel e a lista de lançamentos acompanham. "Tudo" é o
  que mostra o lançamento marcado para daqui a oito meses ou o de dois anos atrás — antes
  eles não apareciam em canto nenhum.
- **Painel com recorte por situação** — **Tudo**, **Já pago** ou **A pagar**, aplicado antes
  de qualquer conta, para que todo indicador da tela fale do mesmo conjunto. Responde
  separadamente a "quanto eu já gastei de verdade?" e "quanto ainda tenho de pagar?".
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
- **Ainda posso gastar** — o número que o painel não dava. Do **dinheiro que já estava nas
  contas quando o período começou**, mais o que entra nele, o app subtrai o que já saiu **e** o
  que ainda vai sair (contas fixas, parcelas, boletos marcados). O saldo de abertura faltava, e
  isso fazia o painel dizer "ainda posso gastar R$ 4.000" para quem começava o mês com R$ 4.500
  na conta e recebia R$ 4.000 — enquanto o cartão ao lado mostrava "Dinheiro disponível
  R$ 8.500". Dois números para a mesma pergunta, discordando na mesma tela; hoje uma verificação
  da simulação cobra que eles sejam iguais. A conta de trás fica escrita embaixo do número
  ("R$ 4.500,00 já havia · R$ 4.000,00 entram · …"), para ser conferida em vez de acreditada.
  O que sobra é o que é escolha — e vem também dividido pelos dias que faltam,
  porque "sobram R$ 1.200" e "sobram R$ 60 por dia até o dia 30" pedem comportamentos
  diferentes de quem lê. Ao lado, o **ritmo do período**: um medidor com uma marca em onde o
  gasto deveria estar a esta altura do mês.
- **Confirmados e em aberto** — o filtro de situação usa esse par, e não "pagos" e "a pagar".
  Nem todo lançamento é conta a pagar: entrada também tem os dois estados, e "salário a pagar"
  é exatamente ao contrário do que acontece. Confirmado/em aberto descreve o estado sem supor
  a direção do dinheiro.
- **Faturas em aberto** — por cartão, quanto está na fatura que fecha agora, quando fecha e
  quando vence. Com quatro cartões, "saldo do cartão" não responde nada. E ao lançar no
  cartão o app diz **em que fatura aquilo cai**.
- **O mês do cartão é o mês em que a fatura vence** — no crédito a data da compra não é a
  data do pagamento, e o app trabalha com as duas (a explicação longa está logo abaixo).
- **Atalhos em todo número** — o aviso de atrasados é um botão; os cartões de entradas,
  saídas e "ainda vai sair" levam à lista daquele recorte; cada barra de categoria abre os
  lançamentos dela; cada coluna do gráfico mensal passa o painel para aquele mês; cada conta
  do "saldo por conta" abre o extrato dela. Ver um número sem poder ir até ele transforma
  informação em cobrança.
- **Analisar** — no painel, um botão com duas abas, porque são duas perguntas diferentes.
  A **leitura do período** responde "o que aconteceu": resultado e margem, gasto contra a
  própria média dos meses fechados, custo fixo sobre a renda, parcelas já comprometidas, onde
  o dinheiro concentra e quais categorias fugiram do padrão. Cada achado carrega o número que
  o sustenta, e o mais grave vem primeiro. É conta, sai na hora, funciona sem internet.
- **Perguntar a uma IA** — a segunda aba responde "e agora, o que eu faço", que é conversa e
  não conta. O app monta o texto e você leva: cinco perguntas prontas (o que está
  acontecendo, onde cortar, como sair das parcelas, posso fazer esta compra, relatório de
  fechamento), com os seus números já organizados e somados. O texto fica à vista num campo
  que dá para editar, e o botão copia. **Nada sai do aparelho sozinho — quem cola é você**, e
  o aviso disso vem antes do texto, não depois. Vão os agregados: totais, série dos meses,
  categorias, custo fixo, parcelas e saldos. **Não vai a descrição de nenhum lançamento** —
  é nelas que mora o que é íntimo, e nenhuma pergunta sobre orçamento precisa delas.
- **Contas agrupadas por banco** — um banco tem conta corrente *e* cartão, e agora eles
  aparecem juntos numa linha só, com o subtotal do grupo no painel. Os dois saldos continuam
  separados de propósito: o dinheiro que está na conta e a fatura que se deve são coisas
  diferentes, e somá-las daria um número que não existe em lugar nenhum. Ao cadastrar
  "Nubank cartão" com um "Nubank" já existente, o app oferece o agrupamento — oferece, nunca
  aplica sozinho.
- **Apagar em lote** — Lançamentos, Fixas e Parcelas. Em Lançamentos é um **modo**: o botão
  *Selecionar* troca a caixa de "pago" pela de marcar e faz a linha selecionar em vez de
  abrir — a linha já tem a caixa de pago e o gesto de arrastar, e três controles no mesmo
  lugar seria erro garantido no celular. A confirmação separa o que é apagado do que é
  apenas **dispensado**: a ocorrência prevista de uma conta fixa não é um registro, é gerada
  pela regra, e some só daquele mês.
  Fixas e Parcelas têm caixa de seleção por linha e uma no cabeçalho
  que marca **o que está na tela**, e não o que existe no banco: com filtros ligados, um
  "selecionar tudo" que pegasse o escondido seria armadilha. A barra que aparece carrega o
  número o tempo todo, e a confirmação distingue as duas ações, que só parecem a mesma:
  apagar uma compra leva as parcelas junto, apagar uma conta fixa deixa o histórico já
  gerado intacto — ele é dinheiro que de fato saiu.
- **Cada parcela leva o próprio número** — "Nina Saude Floripa 3/10", e não dez linhas com o
  mesmo texto. Quando a descrição vem do banco já numerada ("… - Parcela 1/10"), a marca sai
  do nome da compra e volta certa em cada parcela; sem isso, a segunda dizia 1/10 no nome e
  2/10 na etiqueta. Em Ajustes há o atalho para acertar as compras importadas antes disso.
- **Arrastar para marcar pago** — no celular, puxar a linha do lançamento para qualquer lado
  marca ou desmarca, sem abrir nada. O gesto só engata quando o movimento lateral vence o
  vertical com folga, então a página continua rolando normalmente.
- **Nada nasce pago** — nem as parcelas de data já vencida. O app não decide sozinho que
  data no passado significa dinheiro que saiu: a compra pode ter sido cancelada, a fatura
  pode não ter sido paga. Quem diz que pagou é você, na caixa de seleção da lista — que vai
  e volta. Em Ajustes há um **desmarcar todos como pagos**, para recomeçar a marcação do
  zero.
- **Cópias automáticas** — o app guarda sozinho o estado anterior, em três gavetas com
  propósitos diferentes:

  | Gaveta | Quando sai | Quem a substitui |
  | --- | --- | --- |
  | **De rotina** | a cada 6 horas de uso | outra rotina |
  | **Antes da última exclusão** | toda vez que algum registro some, do tamanho que for | outra exclusão |
  | **Antes de uma perda grande** | quando some mais de um terço de uma vez | só outra perda grande |

  As três existem porque a perda grande — um "apagar tudo" sem querer, uma importação
  torta, uma sincronização que trouxe a carteira vazia por cima da cheia — é a que se
  percebe tarde. Se toda exclusão escrevesse na mesma gaveta, apagar dois lançamentos na
  semana seguinte jogaria fora justamente a cópia que ninguém sabia ainda que ia precisar.
  Quando falta espaço no navegador, o app sacrifica as menos preciosas primeiro, nessa
  ordem. Em Ajustes dá para ver, baixar e restaurar cada uma.
- **Importar do banco, em cinco formatos** — CSV, planilha `.xlsx`, **PDF**, **print da tela**
  e **texto colado**. Os cinco convergem cedo para a mesma tabela, e por isso a conferência, a
  detecção de repetidos e o reconhecimento de parcelas valem para todos sem uma linha a mais:

  | Entra | Como é lido |
  | --- | --- |
  | `.csv` / `.txt` | separador descoberto pelo conteúdo, colunas pelo cabeçalho |
  | `.xlsx` | leitor próprio (zip + XML), 10 kB em vez dos 7 MB da biblioteca usual |
  | `.pdf` | pdf.js, carregado só no clique; os pedaços de texto reagrupados em linhas pela posição |
  | print / foto | reconhecimento de texto em português, baixado na primeira vez |
  | colar | a lista copiada do aplicativo do banco, que não exporta nada |

  **O PDF de fatura vem em duas colunas.** Foi o que a fatura do Santander mostrou: dois
  lançamentos lado a lado na mesma altura da página. Agrupar só pela altura fundia os dois
  numa linha só — saía um lançamento com a data de um e o valor do outro, que é pior do que
  não importar, porque parece certo. A detecção de colunas é geral e não uma regra para um
  banco: procura faixas verticais onde nenhum texto aparece, e só aceita o corte se as faixas
  dos dois lados tiverem lançamentos por conta própria. Sem ela, 17 dos 56 lançamentos da
  fatura de teste sumiam e faltavam R$ 442.

  Três coisas a mais que essa fatura ensinou: a **capa** tem linhas com data e valor que não
  são lançamento ("R$ 2.577,79 15/09/2026 R$30.040,00"), e o que as denuncia é a ordem — num
  lançamento a data vem **antes** do valor, sempre; a fatura traz a **data original** da
  compra parcelada, então "26/12" numa fatura de setembro é o Natal que passou, e uma data
  sem ano que cairia no futuro recua um ano; e a fatura com mais de um portador **numera o
  cartão antes da data**, número que não é parte do nome da loja.

  Os três últimos formatos não têm cabeçalho, então a descoberta é **por conteúdo**: numa linha, o que
  parece data é a data, o que parece dinheiro é dinheiro, e o que sobra é a descrição. Dois
  cuidados que fazem a diferença entre funcionar e importar lixo: o **último número de cada
  linha do extrato é o saldo**, não o valor (decidido pelo formato do arquivo inteiro, não
  linha a linha), e o **sinal sai do saldo subindo ou descendo** — a leitura mais confiável
  que existe aí, porque não depende de o banco escrever menos, "D", ou pintar de vermelho.
  Linhas de resumo ("SALDO EM 09/09: 2.210,12") são reconhecidas e não viram lançamento.

  **O que isso custa, dito sem enfeite.** O leitor de PDF (1,7 MB) e o de imagem (alguns
  megabytes de modelo de idioma) são carregados **só quando usados**, não entram no pré-cache
  e não pesam na abertura. No `financeiro.html` de arquivo único eles **não existem** —
  inliná-los levaria o arquivo de 640 kB a dezenas de megabytes, e a tela diz isso em vez de
  simplesmente não funcionar. E o reconhecimento de imagem **erra, em dígito**: o resultado
  cai na mesma conferência linha a linha, com um aviso para conferir valor por valor.

- **O CSV do banco em detalhe** — o extrato ou a fatura que o Nubank (e os outros) exportam.
  O app descobre sozinho o separador e as colunas de data, descrição e valor, compara com o
  que você já lançou e mostra linha por linha o que é novo, o que já existe e o que ficou em
  dúvida — o que parece repetido vem **desmarcado**. A categoria vem sugerida pelo seu
  próprio histórico: se "Uber" sempre foi Transporte, "UBER *TRIP 8823" chega como
  Transporte. E a coluna **Vezes** transforma a linha numa compra parcelada: quando o banco
  escreve "Parcela 1/6" ou "MAGAZINE LUIZA 2/10" na descrição, o número já vem preenchido.
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

A interface é **branca, azul e roxo**: fundos, acento, botões, navegação e seleção. Duas
famílias ficam de fora dessa identidade, de propósito.

**Verde e vermelho de entrada e saída** são semântica de dinheiro, não decoração.

**As cores que identificam conta e categoria nos gráficos** ficam multicolores, e o motivo é
medido. O validador de daltonismo do projeto foi rodado sobre um conjunto todo em azul e
roxo: o melhor resultado deu **ΔE 13,2 para visão normal** (o piso é 15) e **2,9 para
protanopia** (o piso é 8) — categorias vizinhas num gráfico ficariam indistinguíveis até
para quem enxerga todas as cores. A faixa de luminosidade do tema escuro é estreita
(L 0,48–0,67), então nem separar por claro e escuro resolve. Azul e roxo entram onde cabem
(`--series-blue`, `--series-violet`, `--series-magenta`); os quentes ficam porque é o que
mantém um gráfico legível.

O conjunto em uso passa em todas as verificações, nos dois temas: faixa de luminosidade,
piso de saturação, separação sob daltonismo e piso de visão normal.

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

O app é um PWA: fica guardado no aparelho e abre offline. Isso tem um custo — a versão que
roda é a que está guardada, não a que está publicada — e o custo apareceu no uso real: um
botão publicado havia dias **simplesmente não existia no celular**, e não dava para saber se
era defeito da tela ou versão velha.

Três coisas resolvem isso, e as três são necessárias:

1. **Procurar.** O registro do service worker só olha uma vez, ao carregar a página. Num app
   instalado que fica suspenso em segundo plano, isso pode não acontecer por dias. O app
   agora procura de hora em hora e, principalmente, **toda vez que volta para a frente** —
   que é quando a pessoa abre para lançar algo e repararia que falta um botão.
2. **Avisar, sem trocar por baixo.** Achada a versão nova, aparece o aviso com *Atualizar* e
   *Depois*. A troca acontece quando a pessoa manda: recarregar por conta própria pode apagar
   um lançamento digitado pela metade.
3. **Mostrar a versão.** Ajustes → Aparência traz a data e o commit do build, e um botão
   **Procurar atualização** para quem está desconfiado e quer a resposta agora. O botão sempre
   diz o que encontrou — inclusive "não deu para verificar", em vez de fingir que está em dia.

### Testar as telas no navegador

Um defeito de renderização não aparece em teste de unidade: ele derruba a árvore do React e
a página fica em branco. O caso que motivou este teste foi apagar a data com o teclado —
pelo mouse não dava, porque o seletor só produz datas completas.

```bash
npm run build:single && npm run test:telas
```

### "O que fazer": achados com número e caminho

A aba **O que fazer** do Analisar responde a pergunta seguinte à do fechamento. Cada achado
passa por três perguntas antes de existir: o número é grande o bastante para valer a atenção?
existe uma ação concreta, e não um conselho genérico? o valor em reais está dito? Um painel
cheio de "considere revisar seus gastos" não ajuda ninguém e ensina a pessoa a ignorar a tela.

| Achado | O que ele procura | Para onde aponta |
| --- | --- | --- |
| Dinheiro parado | saldo na corrente acima de um mês de gasto | Tesouro Selic, CDB de liquidez diária, conta remunerada |
| Juros pagos | "juros", "rotativo", "IOF", "mora", "multa" nas descrições | portabilidade de dívida, crédito mais barato |
| Tarifas e anuidades | "tarifa", "pacote", "cesta", "anuidade" | conta digital sem tarifa, pedido de isenção |
| Custo fixo subindo | a reta que atravessa doze meses de contas fixas | renegociar as três maiores |
| Assinaturas | três ou mais recorrentes pequenas | a lista, e o que não se usou no mês |
| Parcelas comprometidas | quanto dos próximos 12 meses já está vendido | antecipar com desconto, que a lei obriga |

**Dois totais, e não um.** "Vazando por ano" soma juros, tarifas e contas que subiram — parar
de perder é ganho certo. "Deixando de ganhar" é o dinheiro parado, que depende de uma taxa.
As parcelas comprometidas não entram em nenhum dos dois: não são perda nem ganho, são uma
decisão já tomada. O total único que existia antes somava R$ 16 mil de compromisso com R$ 13
mil de ganho potencial e dava um número grande que não queria dizer nada.

A ordem também é por natureza antes de por valor: o que está queimando vem antes do que está
dormindo, por maior que seja o segundo. Juros de R$ 200 pedem ação hoje; R$ 13 mil parados
podem esperar a semana que vem.

**A única coisa que não vem dos seus lançamentos** é a taxa de rendimento, que fica editável
na própria tela — ela envelhece, e a régua de cada um é diferente.

### "Números": a estatística sem conclusão

A aba ao lado é o material de quem quer conferir a conclusão em vez de aceitá-la: por
categoria, doze meses de **mediana** (e não média — um mês com a compra do notebook levanta a
média e faz o app dizer que você gasta o que não gasta), a **tendência** em reais por mês, a
**previsibilidade** e a projeção do mês seguinte.

A tendência é a reta de mínimos quadrados que atravessa a série, não a diferença entre dois
meses seguidos — essa é ruído. E quando a reta **não descreve** a série (R² abaixo de 0,5),
está escrito "varia demais" em vez de um número inventado com aparência de método.

### Por que a análise é calculada, e não pedida a uma IA

O app é uma página estática publicada no GitHub Pages: não existe servidor onde guardar uma
chave de API. Pôr a chave no código do navegador seria entregá-la a qualquer visitante —
diferente da chave `anon` do Supabase, que é pública por desenho e protegida pelas políticas
do banco, uma chave de modelo de linguagem é segredo de verdade, com custo por uso.

Então a análise é calculada em `src/domain/analise.ts`, e não gerada: sai na hora, funciona
sem internet, não custa nada, não manda os gastos de ninguém para lugar nenhum, e dá o mesmo
resultado toda vez — o que, para número de dinheiro, é qualidade e não limitação. O que ela
faz é o que um relatório de fechamento faz: compara o período com a própria história, separa
estrutura (custo fixo, parcelas comprometidas) do que é escolha do mês, e aponta o que fugiu
do normal com o tamanho de cada coisa.

Isso responde "o que aconteceu". Não responde "e agora, o que eu faço" — isso depende do que
você quer, do que está disposto a cortar, do que vem pela frente, e é conversa. Daí a
segunda aba, em `src/domain/prompt.ts`: o app monta o texto, você leva para o chat que
preferir. A escolha de projeto aqui é o que **não** vai junto. Vão os agregados; **não vai a
descrição de nenhum lançamento** — "Farmácia São João", "Dr. Fulano", o nome de quem te
mandou um Pix. É nas descrições que mora o que é íntimo, e para saber que Saúde subiu 40% o
total de Saúde basta. Um teste nomeado guarda essa promessa, e o aviso de privacidade fica
acima do texto justamente para ser lido antes do botão, não depois.

### Este app é um fluxo de caixa

Não é um demonstrativo de resultado, não é um controle de patrimônio: é **quando entra e
quando sai**. Isso não é rótulo — decide coisas concretas, e três delas estavam decididas de
outro jeito até serem corrigidas:

1. **O número grande do painel é o dinheiro disponível**, e não o patrimônio líquido. Antes
   ele somava tudo (corrente, poupança, dinheiro, investimento) e descontava a dívida dos
   cartões. Na carteira de exemplo isso dava R$ 118.132,10 contra **R$ 112.634,00** de caixa
   real: o número inflava com o que está investido, que não é caixa deste mês, e descontava
   uma dívida que ainda vai aparecer sozinha no dia em que a fatura vence. O investido e a
   fatura por vencer aparecem ao lado, ditos com todas as letras — sem isso, quem tem dinheiro
   no Tesouro acha que o app perdeu dinheiro quando o número encolheu.
2. **O painel diz em que dia o dinheiro acaba.** "Em 30/09 o dinheiro acaba — o saldo fica em
   −R$ 1.400,00 nesse dia", clicável, levando para os lançamentos do dia. O gráfico de saldo
   já mostrava a linha cruzando o zero, mas ninguém lê um gráfico procurando isso. Quando não
   há vermelho nenhum, o aviso ainda aparece se o pior dia ficar abaixo de R$ 300 — terminar o
   fundo do poço com R$ 40 não é negativo, e é exatamente a hora de não parcelar mais nada.
   Esse fluxo olha **90 dias para a frente, independente do período aberto na barra**: o
   aperto costuma estar dois meses adiante, onde as parcelas se acumulam, e ninguém troca o
   período para procurar um problema que ainda não sabe que existe.
3. **O dinheiro não se move no fim de semana.** Uma conta do dia 5 que cai num domingo não sai
   no domingo. Entrada antecipa (o salário vem na sexta), saída posterga (o boleto é pago na
   segunda) — é o que os bancos fazem aqui, e juntar as duas numa regra só faria o salário
   atrasar. Vale para as datas que o app **deriva** (a ocorrência de uma recorrente, o
   vencimento de uma fatura), nunca para a data que a pessoa digitou: se ela lançou um gasto
   num sábado, foi num sábado que ela gastou. Feriados ainda não entram, e está dito no código.

### Investimento: aporte, resgate e rendimento

A guia **Investimentos** tem três botões, e a decisão que os sustenta é uma só:
**o rendimento não é entrada de caixa**. Os R$ 250 que o Tesouro rendeu em setembro não
entraram — engordaram um patrimônio que continua lá dentro. Contá-los como entrada inflaria a
renda do mês, estragaria o "quanto ainda posso gastar" e faria o app dizer que sobrou dinheiro
que ninguém pode gastar sem antes resgatar. O rendimento vira caixa **no dia do resgate**, e
aí ele já é uma retirada.

**Não existe um tipo novo de lançamento.** A tentação era criar um `kind: 'rendimento'` ao
lado de entrada, saída e transferência, e isso obrigaria a mexer nos quinze lugares que
decidem por tipo — para um conceito que os três existentes já expressam:

| O que a pessoa faz | O que fica gravado |
| --- | --- |
| **Aportar** | transferência: conta corrente → investimento |
| **Retirar** | transferência: investimento → conta corrente |
| **Rendimento** | entrada, na conta de investimento |

O que separa o rendimento de um salário não é o tipo do lançamento: é **em que conta ele
cai**. Entrada numa conta de investimento é rendimento, por definição — não existe outra coisa
que ela poderia ser. Daí o carimbo `foraDoCaixa`, calculado uma vez em `entriesInRange` junto
com a data de caixa, e respeitado por todo somatório de fluxo.

A poupança é caixa, e isso não é inconsistência: o rendimento dela cai numa conta de onde se
gasta no mesmo dia, então entra no fluxo como qualquer entrada. Quem decide é a natureza da
conta, não a palavra "rendimento".

Cada conta mostra a identidade que a fecha — `saldo = abertura + aportado − retirado +
rendimento` — escrita na tela e não só no teste: é ela que deixa conferir com o extrato da
corretora sem precisar acreditar no app.

### Duas datas: a da compra e a do caixa

No débito e no Pix são a mesma. No crédito não: comprar dia 1º num cartão que fecha dia 1º e
vence dia 10 é gastar hoje um dinheiro que só sai em **10 de novembro**. O app guarda a data
da compra e deriva a do caixa, e cada uma manda numa coisa:

| Quem pergunta | Responde pela data | Por quê |
| --- | --- | --- |
| Em que fatura a compra caiu | **compra** | é o que define o conteúdo da fatura |
| Quanto devo no cartão | **compra** | a dívida nasce ao passar o cartão |
| A importação do CSV, para não duplicar | **compra** | é a data que o extrato traz |
| O total do mês, a lista, os gráficos | **caixa** | é quando o dinheiro sai da conta |
| Está atrasado? | **caixa** | a compra não atrasa antes de a fatura vencer |

O corte da fatura é `[fechamento anterior, fechamento)` — **a compra do próprio dia do
fechamento já é da fatura seguinte**, que é o que a fatura diz com todas as letras
("compras realizadas a partir da data de fechamento entrarão na próxima fatura"). Num cartão
que fecha dia 28 isso desloca um dia; num que fecha dia 1º, o mês inteiro.

A data de caixa é calculada num lugar só, `entriesInRange` em `src/state/selectors.ts`, que é
o funil por onde todas as telas passam — se cada uma calculasse a sua, a lista e o gráfico
discordariam. Na lista, a data grande é a do dinheiro saindo e uma etiqueta diz de quando é a
compra ("💳 compra 01 set"), porque uma linha em outubro com a data 01/09 e nenhuma
explicação seria pior do que o defeito original.

Um detalhe que custou uma depuração: a janela de busca precisa de folga dos dois lados (uma
compra entra no mês vinda de fora dele), e alargar os extremos do período "Tudo" estoura o
calendário — `0000-01-01 − 70` vira 1899, e `9999-12-31 + 70` vira `10000-03-10`, que
comparado como texto é **menor** que qualquer data de verdade. O mês ficava certo, o ano
ficava certo, e "Tudo" voltava vazio.

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

`test-navegador/dialogos.mjs` é a varredura de CSS dos **diálogos**, que a de cima não
alcança: um diálogo só existe depois de um clique. Cada um dos catorze é aberto em **celular
(390px), tablet (834px) e notebook (1280px), nos dois temas** — 84 conferências — e o
princípio é um só: *o CSS tem de refletir o tamanho das caixas em qualquer aparelho*. Dele
saem cinco cobranças:

| Cobrança | O que ela pega |
| --- | --- |
| A página não passa a rolar de lado | o diálogo empurrando a tela |
| O diálogo cabe na tela | `max-width` que ignora a largura do aparelho |
| **Nenhuma caixa rola de lado por dentro** | conteúdo maior que o recipiente, escondido por um `overflow-x: auto` |
| Nenhum texto fica cortado | `R$ 146.609,00` virando `R$ 146.609,` |
| **Nenhuma célula de tabela é espremida** abaixo de 40px com conteúdo | a coluna que some |

As duas em negrito nasceram do mesmo defeito, e as duas foram vistas **falhando** contra o
código de antes: na conferência do extrato importado as larguras fixas das colunas somavam
474px numa tela de 390, e a descrição — única coluna elástica — encolhia para **6 pixels**.
Com o defeito de volta, a varredura acusa `table-wrap (480 numa caixa de 352)` e
`Descrição (36px)`; sem ele, passa. Essa mesma varredura encontrou um segundo defeito de
graça: acima de 720px o botão redondo de cadastrar some, e como não havia nenhum outro,
**no tablet e no notebook não dava para lançar nada** depois do primeiro lançamento.

```bash
npm run build:single && npm run test:simulacao && npm run test:dialogos
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
