"use strict";
Object.defineProperty(exports, "__esModule", { value: true });

var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };

const Whatsapp = require("@wppconnect-team/wppconnect");
const myTokenStore = new Whatsapp.tokenStore.FileTokenStore({
  decodeFunction: JSON.parse,
  encodeFunction: JSON.stringify,
  encoding: "utf8",
  fileExtension: ".json",
  path: "./tokens",
});

// FIXME: INICIO DOS COMENTÁRIOS DO CÓDIGO

// TODO: NOME DO PROJETO PRA GERAR A CHAVE.JSON
const _project = "lanchonete-app";

const pms = require("./interface/permission.json");
const gestor = require("./models/_gestor");

const db = require("./interface/db_Sheets");
const fnc = require("./helpers/helpers");
const dados = require("./models/_dados");
const { step } = require("./models/_stages");

const moment = __importDefault(require("moment"));
const fs = require("fs");

const cliente = Whatsapp.create({
  session: _project,
  puppeteerOptions: { userDataDir: "./tokens/" + _project + ".data.json/" },
  tokenStore: myTokenStore,
  catchQR: (base64Qrimg, asciiQR, attempts, urlCode) => {},
  statusFind: (statusSession, session) => {
    console.log("Status da Sessão: ", statusSession, "\n");
    console.log("Nome da Sessão: ", session, "\n");
  },
  headless: true,
  devtools: false,
  useChrome: true,
  debug: false,
  logQR: true,
  browserArgs: [
    "--log-level=3",
    "--no-default-browser-check",
    "--disable-site-isolation-trials",
    "--no-experiments",
    "--ignore-gpu-blacklist",
    "--ignore-certificate-errors",
    "--ignore-certificate-errors-spki-list",
    "--disable-gpu",
    "--disable-extensions",
    "--disable-default-apps",
    "--enable-features=NetworkService",
    "--disable-setuid-sandbox",
    "--no-sandbox",
    "--disable-webgl",
    "--disable-threaded-animation",
    "--disable-threaded-scrolling",
    "--disable-in-process-stack-traces",
    "--disable-histogram-customizer",
    "--disable-gl-extensions",
    "--disable-composited-antialiasing",
    "--disable-canvas-aa",
    "--disable-3d-apis",
    "--disable-accelerated-2d-canvas",
    "--disable-accelerated-jpeg-decoding",
    "--disable-accelerated-mjpeg-decode",
    "--disable-app-list-dismiss-on-blur",
    "--disable-accelerated-video-decode",
  ],
  disableSpins: true,
  disableWelcome: true,
  updatesLog: true,
  autoClose: 60000,
  waitForLogin: true,
});

Whatsapp.defaultLogger.level = "silly";

cliente
  .then((client) => {
    fnc.fncgetGestor(pms.p);
    start(client);
  })
  .catch((erro) => {
    console.log(erro);
  });

async function start(client) {
  await client.page.waitForSelector("#app");
  await client.page.evaluate(() => document.querySelector("#app").remove());

  await client.onStateChange((state) => {
    console.log("State changed: ", state);
    if ("CONFLICT".includes(state)) client.useHere();
    if ("UNPAIRED".includes(state)) console.log("logout");
  });

  await client.onIncomingCall(async (call) => {
    console.log(call);
    client.sendText(
      call.peerJid,
      "Olá, no momento não estamos atendendo as chamadas Obrigado!"
    );
  });

  await client.onMessage(async (message) => {
    if (typeof message != "undefined") {
      await client.startTyping(message.from);
    }

    if (
      fnc.fncgetStage(message.from) == 0 &&
      dados[message.from]._id_user == 0
    ) {
      dados[message.from]._phone_num = message.from.split("@")[0];
      if (dados[message.from]._phone_num.length == 12) {
        // TODO: dados[message.from]._phone_num = ((String(`${message.from}`).split('@')[0]).substr(3));
        // TODO: dados[message.from]._phone_num = ((String(`${message.from}`)));
      }

      (async () => {
        // FIXME: Carrega Lista de contatos de redirecionamento
        gestor[pms.p]._phone_redirect = await db.fncListDados(
          "_redirect",
          ["phone"],
          "phone_ativo",
          "Sim"
        );
        if (dados[message.from]._id_user == 0) {
          // 1ª Verificação - Verifica se o Usuário está Cadastrado
          let _id_user = "";
          let _tbCliente = "Clientes";
          let _user = await db.fncListDados(
            _tbCliente,
            ["Codigo", "NomeCliente"],
            "Phone",
            dados[message.from]._phone_num
          );

          if (!_user) {
            _id_user = await db.fncFindDados(
              "_register",
              "Tabela",
              _tbCliente,
              "ID"
            );
            dados[message.from]._phone_name = message.sender.pushname;
            let _addCliente = {
              Codigo: _id_user,
              Status: "Sim",
              Phone: dados[message.from]._phone_num,
              NomeCliente: dados[message.from]._phone_name,
            };
            await db.fncAddDados(_tbCliente, _addCliente);
          } else {
            _id_user = _user[0][0];
            dados[message.from]._phone_name = _user[0][1];
          }

          dados[message.from]._id_user = _id_user;

          console.log(
            ">>> Captura do Cliente: ",
            _id_user + " - " + dados[message.from]._phone_name
          );
        }

        // 2ª Verificação - Se o Pedido existe, caso contrário, abrirá um novo
        // Verifica se tem algum Pedido em aberto do Cliente

        console.log(">>> Verificando se há pedido Aberto...");
        let _pedidoAberto = await db.fncListDados(
          "_register",
          ["Key_Pedido"],
          "Key_Cliente",
          dados[message.from]._id_user
        );

        console.log(">>> Retorno da verificação", _pedidoAberto);
        if (_pedidoAberto) {
          let _pedido = await db.fncListDados(
            "Pedidos",
            ["Pedido", "Data", "NomeCliente", "Num_Item", "Total"],
            "Key",
            _pedidoAberto[0][0]
          );

          console.log(
            ">>> Verificando se o pedido " + _pedidoAberto + " possui itens..."
          );
          if (_pedido) {
            console.log(
              ">>> Preparando os itens do pedido " + _pedidoAberto + "..."
            );
            let _total = 0;
            if (_pedido[0][4]) {
              _total = parseFloat(_pedido[0][4].replace(",", "."));
            }
            dados[message.from]._pedido._key = _pedidoAberto[0][0];
            dados[message.from]._pedido._numero = _pedido[0][0];
            dados[message.from]._pedido._data = _pedido[0][1];
            dados[message.from]._pedido._name = _pedido[0][2];
            dados[message.from]._pedido._count = _pedido[0][3];
            dados[message.from]._pedido._total = _total;

            let _itens = await db.fncListDados(
              "Pedidos_itens",
              [
                "Id_Produto",
                "Produto",
                "Imagem",
                "Qtde",
                "Vlr_Unitario",
                "SubTotal",
              ],
              "Pedido",
              _pedidoAberto[0][0]
            );

            console.log(">>> Verificando os itens...");
            if (_itens) {
              console.log(">>> Importando...");
              for (let x in _itens) {
                dados[message.from]._pedido._itens[x] = [
                  _itens[x][0],
                  _itens[x][1],
                  _itens[x][2],
                  parseFloat(_itens[x][3].replace(",", ".")),
                  parseFloat(_itens[x][4].replace(",", ".")),
                  parseFloat(_itens[x][5].replace(",", ".")),
                ];

                console.log(">>> | Produto " + _itens[x][0] + " importado...");
              }

              console.log(">>> Importação realizada com sucesso!");
            }
          }
        } else {
          let vNow = moment.default(new Date());
          let _dtPedido = vNow.format("DD/MM/YY HH:mm:ss");
          let _tbTabela = "Pedidos";
          dados[message.from]._pedido._numero = await db.fncFindDados(
            "_register",
            "Tabela",
            _tbTabela,
            "ID"
          );
          dados[message.from]._pedido._key =
            dados[message.from]._phone_num +
            "-" +
            dados[message.from]._pedido._numero;
          dados[message.from]._pedido._data = _dtPedido;
          dados[message.from]._pedido._count = 1;
          let _addPedido = {
            Key:
              dados[message.from]._phone_num +
              "-" +
              dados[message.from]._pedido._numero,
            Pedido: dados[message.from]._pedido._numero,
            Status: "Não",
            Phone: dados[message.from]._phone_num,
            Data: _dtPedido,
            Atendimento: "----",
            Id_Cliente: dados[message.from]._id_user,
            NomeCliente: dados[message.from]._phone_name,
          };
          await db.fncAddDados(_tbTabela, _addPedido);
        }
      })();
    }

    dados[message.from]._message = message;

    let resp = step[fnc.fncgetStage(message.from)].obj.execute(
      message.from,
      message.body
    );

    for (let index = 0; index < resp.length; index++) {
      const element = resp[index];
      // Habilitar o atendimento humano
      if (dados[message.from]._human === true) {
        //Prepara a mensagem de informação que será o atendente humano
        if (dados[message.from]._human_chat === false) {
          dados[message.from]._human_chat = true;
          await client.sendText(message.from, element);
        }

        //Prepara a mensagem de que irá atender
        if (dados[message.from]._human_atend != "") {
          await fnc.sleep(10000);
          await client.sendText(message.from, dados[message.from]._human_atend);
          dados[message.from]._human_atend = "";
        }
      } else {
        dados[message.from]._human_chat = false;
        if (dados[message.from]._type.type_option == "chat") {
          await client.sendText(message.from, element);
        } else if (dados[message.from]._type.type_option == "image") {
          await client.sendImage(
            message.from,
            "img/" + dados[message.from]._type.type_file,
            dados[message.from]._type.type_name,
            element
          );
        } else if (dados[message.from]._type.type_option == "location") {
          await client.sendLocation(message.from, pms.lat, pms.lng, element);
        } else if (dados[message.from]._type.type_option == "contato") {
          await client.sendText(message.from, element);
          await client.sendContactVcard(
            message.from,
            pms.atend_phone,
            pms.atend
          );
        }
      }

      dados[message.from]._type.type_option = "chat";
      // Gerar um intervalo personalizado Sleep.
      if (dados[message.from].sleep > 0) {
        await fnc.sleep(dados[message.from].sleep * 1000);
        dados[message.from].sleep = 0;
      }
      // Encaminhar o Pedido para os Número habilitados.
      if (dados[message.from]._pedido_enviar == true) {
        let _phone_redirect = gestor[pms.p]._phone_redirect;
        let _pedido_redirect = fnc.fncPedidoEnviar(message.from);

        for (let t in _phone_redirect) {
          console.log("Enviando mensagem para...", _phone_redirect[t]);

          await client.sendText(
            "55" + _phone_redirect[t] + "@c.us",
            _pedido_redirect
          );

          if (dados[message.from]._pedido._delivery == "1") {
            await client.sendText(
              "55" + _phone_redirect[t] + "@c.us",
              "👇🏼 _Localização do Cliente para Entrega!_"
            );
            await client.sendLocation(
              "55" + _phone_redirect[t] + "@c.us",
              dados[message.from]._pedido._lat,
              dados[message.from]._pedido._lng,
              dados[message.from]._pedido._address
            );
          }
        }

        dados[message.from]._id_user = 0;
        dados[message.from]._pedido._key = "";
        dados[message.from]._pedido._numero = "";
        dados[message.from]._pedido._data = "";
        dados[message.from]._pedido._count = 0;
        dados[message.from]._pedido._total = 0;
        dados[message.from]._pedido._delivery = "";
        dados[message.from]._pedido._lat = "";
        dados[message.from]._pedido._lng = "";
        dados[message.from]._pedido._address = "";
        dados[message.from]._pedido._reference = "";
        dados[message.from]._pedido._payment = "";
        dados[message.from]._pedido._itens = [];
        dados[message.from]._pedido_item_stage = "prod";
        dados[message.from]._pedido_cod_stage = "";
        dados[message.from]._pedido_enviar = false;
      }
      //lista da promoção
      if (dados[message.from]._promotion == true) {
        for (let x in gestor[pms.p]._produto_promotion) {
          await client.sendImage(
            message.from,
            "img/Promocoes/" + gestor[pms.p]._produto_promotion[x][4],
            gestor[pms.p]._produto_promotion[x][4],
            "_" + gestor[pms.p]._produto_promotion[x][1] + "_"
          );
        }
        await client.sendText(
          message.from,
          "" + " _Caso você queira receber nossa novidades, cadastre-se._"
        );
        dados[message.from]._promotion = false;
      }
      //Resultado da pesquisa de produtos
      if (dados[message.from]._search_prod.length > 0) {
        for (let x in dados[message.from]._search_prod) {
          await client.sendImage(
            message.from,
            "img/produtos/" + dados[message.from]._search_prod[x][0] + ".png",
            dados[message.from]._search_prod[x][0] + ".png",
            "Cód.: *" +
              dados[message.from]._search_prod[x][0] +
              "*  " +
              "\n" +
              "Produto:" +
              dados[message.from]._search_prod[x][1] +
              "\n" //+
            //'_*Descrição:*_ ' + dados[message.from]._search_prod[x][4]
          );
        }

        await client.sendText(
          message.from,
          "" +
            " _Para continuar pesquisando digite um novo termo para pesquisar os produtos._" +
            "\n\n" +
            "ou digite *️⃣ para voltar para o menu"
        );
        dados[message.from]._search_prod = [];
      }
    }

    if (typeof message != "undefined") {
      await client.stopTyping(message.from);
    }
  });
}

exports.cliente = cliente;
