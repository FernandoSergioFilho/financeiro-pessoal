# Financeiro pessoal

Controle financeiro pessoal que roda no navegador — desktop e celular. Registra
lançamentos, projeta **contas recorrentes** e acompanha **compras parceladas**.

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

## Caminho para a versão online

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
