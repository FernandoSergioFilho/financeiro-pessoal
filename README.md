# Financeiro pessoal

Controle financeiro pessoal que roda no navegador — desktop e celular. Registra
lançamentos, projeta **contas recorrentes** e acompanha **compras parceladas**.

**No ar:** https://fernandosergiofilho.github.io/financeiro-pessoal/

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
| `npm test` | Testes do domínio (81 casos) |
| `npm run typecheck` | Checagem de tipos |
| `npm run build` | Build de produção em `dist/` |
| `npm run preview` | Serve o build para conferência |

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
- **Painel do mês** — saldo de hoje, entradas, saídas, sobra, gastos por categoria,
  entradas × saídas nos últimos seis meses e saldo por conta. Alerta de contas vencidas
  que continuam como previstas.
- **Contas e categorias** editáveis, com cores e ícones.
- **Backup e planilha** — exportar os lançamentos do mês em CSV (abre direto no Excel e no
  LibreOffice em português), baixar um backup completo em JSON e restaurá-lo depois.
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

**Dinheiro em centavos, datas como texto.** Valores são inteiros em centavos (nada de
`0.1 + 0.2`), e datas são strings `YYYY-MM-DD` com aritmética própria — usar `Date` traria
fuso horário para dentro do domínio e faria 31/01 virar 30/01 a oeste de Greenwich. Somar
mês preserva o dia quando ele existe (31/01 + 1 mês = 28/02, mas 31/01 + 3 meses = 30/04).

### Cores

A paleta de categorias e dos gráficos foi validada para daltonismo (separação em CVD,
contraste e faixa de luminosidade) nos temas claro e escuro. As cores são guardadas como
*nome de posição na paleta* (`'blue'`), não como hex, então o tema escuro usa outro passo
da mesma família sem tocar nos dados.

## Sincronizar entre aparelhos

O app pode funcionar em dois modos, e o segundo é opcional:

- **Só local** (sem configuração): os lançamentos ficam no navegador do aparelho.
- **Com carteira compartilhada**: duas pessoas, cada uma com seu login, enxergam e editam
  os mesmos lançamentos, de qualquer aparelho.

Continua **local-first** nos dois casos: o app grava no navegador e funciona offline; a
sincronização acontece por trás, e o que for lançado sem sinal sobe quando a conexão volta.

### Ligar a sincronização

1. Crie um projeto no [supabase.com](https://supabase.com) (plano gratuito).
2. No **SQL Editor**, rode o arquivo [`supabase/schema.sql`](supabase/schema.sql).
3. Em **Settings → API**, copie a *Project URL* e a chave **`anon`** para o
   `.env.production` (veja `.env.example` para o formato). A chave `service_role` não
   entra aqui nem em lugar nenhum: ela ignora todas as políticas de acesso.

No app, a área fica em **Ajustes → Conta e sincronização**: você entra com um link enviado
por e-mail (sem senha) e pode gerar um **código de convite** para a segunda pessoa.

### Por que a chave fica versionada, e não num "secret"

A chave `anon` é **pública por natureza**: ela é compilada dentro do JavaScript que o site
entrega a qualquer visitante. Dá para conferir depois de um `npm run build`:

```bash
grep -c "eyJhbGciOi" dist/assets/index-*.js   # a chave está lá
```

Guardá-la num secret do GitHub não a esconderia de ninguém — só daria uma falsa sensação
de segurança, além de exigir configuração manual a cada clone. Quem realmente protege os
lançamentos são as políticas de acesso em `supabase/schema.sql`.

**Confirme isso você mesmo**, antes de publicar e sempre que mexer no schema:

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
