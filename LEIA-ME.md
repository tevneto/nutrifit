# NutriFit

Aplicativo web responsivo para diário alimentar, planejamento e acompanhamento pessoal. Os registros permanecem no armazenamento local do navegador deste dispositivo.

## Como abrir

1. Descompacte a pasta.
2. No Windows, execute `Iniciar NutriFit.bat` (requer Python instalado). Alternativamente, abra um terminal dentro da pasta e execute `python -m http.server 8000`.
3. Acesse `http://localhost:8000` no navegador.

O servidor local habilita câmera e instalação PWA em navegadores compatíveis. Os ícones SVG do aplicativo ficam na pasta `icons/`. A conexão com a internet é necessária para pesquisar produtos no Open Food Facts e carregar a fonte tipográfica; registros locais funcionam sem conexão depois que a página carrega.

## O que já funciona

- Painel diário integrado com calorias, macronutrientes, hidratação, atividade e peso recente.
- Perfil, estimativa Mifflin–St Jeor, escolha explícita de meta calórica e distribuição de macros. As porcentagens precisam somar 100%; conversões usam 4/4/9 kcal por grama.
- Diário alimentar por data e refeição, consulta de produtos no Open Food Facts, entrada manual por rótulo, edição de quantidade, remoção, repetição e cópia do dia anterior.
- Fibras, sódio e campo de micronutrientes informado pelo usuário; modo de carboidratos líquidos a partir de carboidratos e fibras.
- Cadastro de receitas com cálculo a partir dos valores nutricionais informados e registro de porções.
- Entrada por fala nos navegadores com reconhecimento de voz. A transcrição preenche o diário para revisão.
- Foto do prato com registro assistido pelo usuário. A imagem não é reconhecida automaticamente; porção e nutrição são informadas/revisadas manualmente.
- Leitor de código de barras quando `BarcodeDetector` e acesso à câmera estão disponíveis; busca alternativa pelo código digitado.
- Plano diário/semanal, preferências, alergias, registro no diário e lista de compras com itens marcáveis.
- Hidratação com meta configurável, registros por recipiente e histórico por data.
- Exercícios, passos, duração, distâncias e detalhes de musculação; evolução com peso, percentual de gordura, massa estimada, circunferências e foto opcional.
- Assistente local de perguntas frequentes baseado nos registros existentes; exportação integral JSON, CSV de alimentação e impressão/salvar em PDF.
- Interface adaptada a celular e computador; cache dos arquivos principais para acesso offline e instalação em navegadores compatíveis.

## Limites desta versão

Esta entrega não tem backend, contas de usuário, sincronização entre dispositivos, backup central, criptografia de banco ou controle multiusuário. Portanto, é apropriada para uso pessoal/local e não deve ser tratada como um serviço de saúde com armazenamento seguro de dados sensíveis.

O catálogo usa Open Food Facts quando há conexão. A cobertura e os dados variam por produto. TBCA e USDA FoodData Central, Excel, exportação completa em PDF, importação de receitas em sites sem CORS, integrações Fitbit/Garmin/Apple Health/Health Connect, notificações, IA generativa e visão computacional exigem integração e configuração de serviços externos. O aplicativo não inventa dados ausentes e marca resultados de gasto e metabolismo como estimativas.

Para implantação multiusuário, o próximo passo é conectar autenticação e banco PostgreSQL (por exemplo, Supabase), políticas de acesso por usuário, armazenamento privado de fotos, backups e consentimento explícito para cada integração, além de revisar requisitos da LGPD antes de publicar.

## Correções da versão 1.1

- O app agora desenha a tela inicial ao abrir (antes ficava em branco até trocar de página).
- Datas usam o fuso do aparelho: registros feitos depois das 21h não vão mais para o dia seguinte. Ao abrir, o app sempre mostra o dia atual e acompanha a virada da meia-noite.
- "Repetir" cria um registro novo que pode ser editado e apagado. Itens antigos sem identificação são reparados automaticamente.
- Unidade "unidade": os valores nutricionais passam a ser por unidade (o rótulo do formulário muda junto).
- Trocar os macros entre porcentagem e gramas converte os valores em vez de zerá-los.
- Fotos são reduzidas automaticamente (máx. 800–1000 px) e aparecem no diário e na evolução. Se o armazenamento do navegador encher, o app avisa e não mostra como salvo algo que não foi gravado.
- Metas por refeição somam 100% (café 25%, almoço 30%, jantar 25%, lanches 10%, ceia 10%).
- Receitas exigem a quantidade usada de cada ingrediente (6º campo) e aceitam vírgula decimal.
- Plano alimentar registra carboidratos e gorduras.
- Open Food Facts: código de barras consultado diretamente; produtos sem calorias não entram mais como 0 kcal.
- Opções que não faziam nada agora funcionam (calorias de exercício na meta, carboidratos líquidos, lembrete de água a cada 2 h com o app aberto). A opção de polióis foi removida por não haver campo de polióis.
- Relatórios aparece no menu.
- O cache offline busca sempre a versão mais nova quando há conexão, então atualizações chegam sem precisar limpar o navegador.
- `Iniciar NutriFit.bat` procura `py` ou `python`, avisa se o Python não estiver instalado e abre o navegador só depois que o servidor sobe.
