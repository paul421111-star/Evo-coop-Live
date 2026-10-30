# Mapa mental — Evo Coop Live

Atualizado em 30/10/2026. Branch `feat/grupo-12-fachada-real`. O último commit enviado ao `origin` segue `30e5c41`; a regra de inadimplente ainda está só neste computador.

Leia este arquivo antes de abrir o código. Ele diz o que o sistema faz, onde cada coisa mora e o que não pode ser mexido. Quando uma mudança alterar comportamento, arquitetura ou regra, atualize a seção correspondente e a data do topo. Não copie código para cá e não grave senha, token, CPF, telefone nem conteúdo do `.env`.

## O que é

Aplicação em português da Cooperativa Habitacional Vida Nova. O operador conduz o sorteio de apartamentos ao vivo e a mesa de cobrança. O associado acompanha o ranking, informa antecipação e vê a escolha em tempo real. O usuário de transmissão vê a mesma tela do operador, sem poder alterar nada.

React + Vite no navegador. Express + Postgres (Supabase) no servidor. Um processo só: a API também entrega o site depois do build.

## Como sobe

| Modo | Comando | Onde |
| --- | --- | --- |
| Desenvolvimento | `npm run dev` | Site em `https://127.0.0.1:4173` (certificado local). API em `http://127.0.0.1:3015`. Na rede: `https://10.10.10.17:4173`. |
| Evento | `npm run build` e depois `npm start` | O `start` passa por `scripts/supervise.ts`: se o processo cair, ele sobe de novo (1 s, 2 s, 4 s, até 30 s). `npm run start:once` sobe sem supervisor. |

O Vite de desenvolvimento não aguenta mil associados. No evento o site sai do Express, atrás de um túnel HTTPS com nome fixo. O endereço `trycloudflare.com` do `.env` é temporário.

## Quem entra

| Papel | O que faz |
| --- | --- |
| `admin` (Paulo) | Tudo, inclusive limpar o mapa de teste e administrar usuários. |
| `operator_sede` | Sorteio, ranking e antecipação. |
| `operator_obra` | Sorteio, sem a antecipação. |
| `live` | Espelha o operador. Não grava, não publica, não vê nomes. |
| Associado | Portal público, com contrato de 6 dígitos e os 5 últimos do CPF. |

`canViewAnticipation` vale para admin e operador da sede.

## Empreendimentos

| Projeto | Prédio no código | Grupos | Andares |
| --- | --- | --- | --- |
| Parque Firenze, Embu | `odd` (ímpares) | 13, 15, 17 | 36 andares, 4 finais |
| Parque Firenze, Embu | `even` (pares, Grupo 12) | 12, 14, 16, 18 | 28 andares, 8 finais, 224 unidades |
| Jardim das Artes, Embu | `jardim-artes` | 11 | 27 andares, 4 finais |
| Recanto da Iracema, Taboão | `cond-iracema` | 19 | térreo com 7 e 28 pavimentos com 8 |

O contrato tem 6 dígitos: os 2 primeiros são o grupo, os 4 últimos são a bolinha (`ContractDigits`). No Grupo 12 o prédio em uso é `public/models` da fachada real. A versão premium, com sol e entorno dentro do GLB, está só na branch `feat/grupo-12-torre-premium` e não foi enviada.

## Telas do operador

Rotas em `src/App.tsx`: `/sorteio` (mapa), `/ranking`, `/cobranca`.

No topo, operador e administrador veem quem está logado no portal deste evento. A transmissão não vê essa lista. Na cobrança, a configuração fica à esquerda e a lista de quem ligar ocupa o restante da tela. O contrato mostra nome, CPF e nascimento para a conferência, com o checkbox Conferido; o associado só vai ao ar depois disso. Cada linha de voz pode ficar com um usuário ou livre para quem não está em ligação. No sorteio, a barra escolhe os dois, só o prédio ou só a planta (`BuildingScene`, `FloorPlanScene`). A transmissão acompanha. A plaquinha da vez (`TurnSign`) e o mapa de unidades (`ApartmentGrid`) ficam na mesma tela. Com a planta aberta, a plaquinha fica no alto dela, só na largura do número, ao lado do título "Planta ampliada". A caixa do apartamento selecionado fica à direita da torre, fora da fachada. Na planta, o sol nascente fica abaixo desse título, sem cobrir os apartamentos, e o sol poente no canto inferior esquerdo. A etiqueta "Nascer do sol" também fica abaixo do título, para não sumir atrás dele. No tema claro, o fundo da planta e os cartões ficam claros, no mesmo tom do prédio. A planta ocupa a área inteira: os cartões flutuam por cima, sem a faixa da direita, e a borda deles é um gradiente dourado. A plaquinha do bloco fica no rodapé mesmo com o sol poente no canto esquerdo. No tema escuro, a placa da vez usa o azul da cooperativa, e os quatro últimos dígitos do contrato ficam com brilho fixo. Reservado fica amarelo e o apartamento selecionado fica azul, na planta, na torre e no mapa de unidades. O administrador pode editar o contrato de uma reserva já confirmada. Filtros de andar, final e situação. O botão **Mais alto livre** acompanha o apartamento livre do andar mais alto (`highestFreeApartment` em `src/config/building.ts`); escolher outro apartamento desliga o acompanhamento. A faixa do topo e a placa sobre a planta mostram o número da vez em destaque.

A transmissão (`role === 'live'`) usa esta mesma tela. `requestApartment` não faz nada, os controles de escrita somem e o servidor recusa o restante das rotas. A lista de abdicação abre já visível, sem o formulário de inclusão e sem o nome. O que ela pode ler: `GET /map`, `GET /auth/me`, `POST /auth/logout`, `GET /live/board`, `GET /anticipation-sessions/current`. Nomes de participantes saem em branco. `LiveScreen.tsx` existe, mas o `App` não usa mais.

O operador publica o foco a cada mudança, com 300 ms de espera, em `PUT /api/live/board`: prédio, grupo, apartamento, vista, tema e disponibilidade. O número do sorteado só entra nessa publicação no botão Enviar, ao lado do campo.

## Sorteio e antecipação

Estados da sessão: `draft` (associado ainda muda a quantidade), `locked` (só confirma ou recusa), `active` (escolha ao vivo), `closed`.

Na sessão ativa a vez alterna entre antecipador e sorteio (`nextSource`). A plaquinha só troca no botão **Próximo** e mostra a chamada atual, como 1º antecipador e 1º sorteado. Abaixo de Próximo, Abdicação abre Não atendeu e Abdicou; a escolha já registra a abdicação da chamada atual. Abdições entram na conta das chamadas de antecipador. Abdicação fora da vez, feita pelo admin no ranking (`abdicated`), tira o associado da fila sem gastar chamada: sai da numeração e o próximo de fora das vagas sobe. Antecipação desta rodada: de 10 até o que falta para 30, somando eventos anteriores. Quem recusa fica com o saldo anterior.

Limpar o mapa de teste (`POST /api/map/clear`) também zera o ranking da sessão aberta, na mesma transação. Não rode isso sem pedido explícito. Não mude `status` nem `next_source` da sessão ao vivo, e não feche a sessão, sem pedido explícito.

O admin marca o contrato inadimplente na linha do ranking. Na config há dois botões: **Inadimplente acessa** (entra no portal e vê que não participa) e **Permite participar do sorteio** (entra na fila e pode ser chamado). Participar vale mais que só acessar. Com os dois desligados, o login desse contrato fica fechado. Contrato sem a marca segue normal.

## Portal do associado

`src/components/AssociatePortal.tsx`. A entrada se apresenta como o evento de sorteio. Desafio de soma, contrato, CPF, e confirmação por celular ou e-mail. No celular, o número do cadastro entra no portal; um número novo também entra no portal e vai para a lista de ligação da cobrança, sem trocar o cadastro. A sessão dura 24 horas (a do operador também). Se o contrato está inadimplente e não pode participar, o portal mostra: "Você está inadimplente e não participará do sorteio."

Com a sessão ativa, o painel do sorteio (`AssociateDrawPanel`) consulta `GET /api/public/portal/board` a cada 1 s. O ranking consulta `GET /api/public/portal` a cada 3 s. Aba escondida para de consultar e atualiza ao voltar. Três apresentações: Lista, Prédio 3D e Andar 3D. Os cartões do painel mostram só unidades, disponíveis e definidos. O manual (`portal-tour`) posiciona o cartão com `src/components/tourPlacement.ts`, para o painel de apartamentos, que é maior que a tela, não empurrar o texto para fora.

## O que segura mil acessos

Tudo isso está em `server/index.ts`, `server/sharedCache.ts` e `server/db.ts`.

- O painel do sorteio é montado uma vez a cada 700 ms por evento e servido a todos. O ranking, a cada 2 s. Confirmar, alterar ou recusar antecipação apaga esse cache na hora.
- A sessão do associado fica 10 s em memória. Sai no logout, quando o evento fecha, e quando o admin muda a regra ou a marca de inadimplente.
- Resposta comprimida. Se nada mudou, o navegador recebe 304, sem corpo.
- Pool do Postgres com no máximo 30 conexões (`DATABASE_POOL_MAX` troca isso). Uma conexão ociosa derrubada pelo Supabase não derruba o processo.
- Login do portal: 600 por minuto por IP real e 10 por minuto por contrato. O servidor confia no proxy local (`trust proxy`) e o Vite repassa o IP (`xfwd`).
- Sessões vencidas saem do banco a cada 10 minutos. Arquivos de `/assets` ficam um ano no navegador; o resto, uma hora.

Medido em 28/10/2026, na API local: 1000 logins juntos em 1,7 s, sem erro. 1500 portais abertos por um minuto, pelo caminho de um túnel, sem falha; a mediana do painel ficou em 84 ms e a memória do processo em cerca de 150 MB. Conexão direta de mil navegadores no Windows recusa parte das conexões. Por isso o evento precisa do túnel.

Repetir com `npx tsx scripts/loadTestLogin.ts` e `npx tsx scripts/loadTestPortal.ts` (`TUNNEL=1` simula o túnel).

## Onde olhar

| Assunto | Arquivo |
| --- | --- |
| Tela do operador e da transmissão | `src/App.tsx` |
| Plaquinha da vez | `src/components/TurnSign.tsx` |
| Portal e manual | `src/components/AssociatePortal.tsx`, `src/components/tourPlacement.ts` |
| Painel do sorteio do associado | `src/components/AssociateDrawPanel.tsx` |
| Prédio, planta, unidades | `src/components/BuildingScene.tsx`, `FloorPlanScene.tsx`, `ApartmentGrid.tsx` |
| Regras do prédio e apartamento mais alto livre | `src/config/building.ts` |
| Grupos, contrato, sessão de antecipação | `src/config/drawGroups.ts`, `anticipation.ts`, `eventWorkspace.ts` |
| Chamadas HTTP do navegador | `src/api/client.ts` |
| API, autenticação, caches | `server/index.ts`, `server/sharedCache.ts`, `server/db.ts` |
| Cobrança, WhatsApp e ligação | `server/whatsapp/`, `src/components/CobrancaDesk.tsx` |
| Esquema do banco | `server/migrate.ts` |
| Supervisor e testes de carga | `scripts/supervise.ts`, `scripts/loadTestLogin.ts`, `scripts/loadTestPortal.ts` |

## Não fazer

- Não mostrar o `.env`, a senha do admin, CPF, telefone, e-mail ou os arquivos de sessão do WhatsApp.
- Não colocar segredo da Twilio no código nem no Git, e não disparar ligação.
- Não recolocar o brilho de anulação do sorteio.
- Não regravar os dados de sol e entorno.
- Não fechar, travar nem limpar a sessão ao vivo sem pedido explícito.

## Em aberto

- A linha de WhatsApp da cobrança está desconectada (código 401). Precisa de um QR novo antes de enviar mensagens.
- Falta um túnel HTTPS com nome fixo para o evento. O de teste muda de endereço.
- `main` está 1 commit à frente do `origin` e não foi enviado. A branch da torre premium também não.
- O manual do associado foi ajustado e testado em unidade. Ainda não foi percorrido no navegador com um associado logado.

## Como manter este mapa

Uma mudança de comportamento ganha uma frase na seção certa e a data do topo. Ideia nova entra em **Em aberto**. Ideia feita sai de lá e vira frase na seção que ela alterou. Se uma frase daqui contradisser o código, o código vence e a frase é corrigida.
