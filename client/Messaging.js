function initApp() {
  Utils = {

    // get a cookie from the document.cookie string
    getCookie: (name) => {
      const key = `${name}=`;
      const decodedCookie = decodeURIComponent(document.cookie);
      const ca = decodedCookie.split(';');
      for (let i = 0; i < ca.length; i += 1) {
        let c = ca[i];
        while (c.charAt(0) === ' ') {
          c = c.substring(1);
        }
        if (c.indexOf(key) === 0) {
          return c.substring(key.length, c.length);
        }
      }
      return false;
    },

    // add a new cookie to document.cookie
    setCookie: (name, value, daysTillExpiration) => {
      const d = new Date();
      d.setTime(d.getTime() + (daysTillExpiration * 24 * 60 * 60 * 1000));
      const expires = `expires=${d.toUTCString()}`;
      document.cookie = `${name}=${value};${expires};path=/`;
    }
  };
  App = {
    constants: {
      // API_URL: location.href.indexOf('localhost') > 0
      //   ? 'http://localhost:8080/AnotherCloudApp/messaging'
      //   : 'https://gcucloud.herokuapp.com/messaging',

      // the base url for the API
      API_URL: 'https://gcucloud.herokuapp.com/messaging',

      // the number of messages to retrieve at once.
      LOAD_SIZE: 10,
    },
    state: {

      // the index of the oldest retrieved message
      lowIndex: 0,

      // the index of the newest retrieved message
      highIndex: 0,

      // the name of the user
      name: (() => {

        // try to get the name from a cookie
        const name = Utils.getCookie('nickname');
        Utils.setCookie('nickname', name, 14);
        if (!!name & name != 'false') {
          return name;
        }

        // if no cookie is found, prompt user for a nickname
        $('#overlay').addClass('d-flex').removeClass('d-none');
        return null;
      })()
    },
    requests: {
      getNewMessages: () => {
        const options = App.helpers.getOptions('GET', `get-new-messages?index=${App.state.highIndex}`);
        return $.ajax(options);
      },
      getMessageRange: (index, count) => {
        const options = App.helpers.getOptions('GET', `getmessages?index=${index}&count=${count}`);
        return $.ajax(options);
      },
      sendMessage: (message) => {
        const options = App.helpers.getOptions('POST', 'sendmessage');

        // add data to options
        options.data = JSON.stringify({
          'messagebody': message,
          'creationdate': moment(new Date()).format('Y-MM-DD hh:mm:ss'),
          'sender': App.state.name
        });

        // specify the body format
        options.processData = false;
        options.headers["Content-Type"] = 'application/json';
        console.log(options);
        return $.ajax(options);
      },
      updateMessage: (message, id) => {
        const options = App.helpers.getOptions('PUT', 'updatemessage');

        // add data for update
        options.data = JSON.stringify({
          'id': id,
          'messagebody': message
        });

        // specify body format
        options.processData = false;
        options.headers["Content-Type"] = 'application/json';
        return $.ajax(options);
      },
      deleteMessage: (id) => {
        const options = App.helpers.getOptions('DELETE', `deletemessage/${id}`);
        return $.ajax(options);
      }
    },
    helpers: {

      // returns a base ajax options object
      getOptions(method, uri) {
        return {
          async: true,
          crossDomain: true,
          url: `${App.constants.API_URL}/${uri}`,
          method: method,
          headers: {
            'cache-control': 'no-cache'
          }
        }
      }
    },
    actions: {
      init: () => {

        // add the first ten messages to the chat.
        App.actions.loadMessages();

        // change the chat header to use the user's nickname
        App.dom.updateName();

        // bind the enter key (13) to the send button.
        App.elements.input.keyup((ev) => {
          if (ev.which === 13) {
            App.actions.sendMessage();
          }
		});

        // listen for new messages.
		App.state.listener = setInterval(App.actions.loadRecent, 1500);
      },
      loadRecent: () => {

        // send a request for the messages.
        const promise = App.requests.getNewMessages();
        promise.done(response => {

          // if messages are returned, add them to the chat box.
          if (response.data.length > 0) {

            // get the latest id
            const recent = response.data[response.data.length - 1].id;
            console.log('recent:', recent, 'top index:', App.state.highIndex);
            if (recent > App.state.highIndex) {

              // update the app state
              App.state.highIndex = recent;

              // append the new messages
              App.dom.appendMessagesToChat(response.data);
            }
          }
        });
      },
      loadMessages: () => {

        // request a range of messages preceeding the current index of the oldest retrieved message
        const promise = App.requests.getMessageRange(App.state.lowIndex, App.constants.LOAD_SIZE);
        promise.done(response => {

          // if results were returned add them to the page.
          if (response.data.length > 0) {
            if (App.state.highIndex === 0) {

              // if this is the first call, set the initial highest index
              App.state.highIndex = response.data[0].id;
              console.log(App.state.highIndex);
            }
            App.dom.prependMessagesToChat(response.data);
          } else {

            // assume there are no older messages and disable the button.
            App.dom.disableLoader();
          }
        });
      },
      sendMessage: () => {

        // get the message from the messaging input
        const message = App.elements.input.val();

        // make sure the message is not empty or just spaces.
        if (message.trim().length > 0) {

          // do a POST request with the message
          App.requests.sendMessage(message).done(() => {

            // clear the message box.
            App.dom.clearMessageBox();
          });
        }
      },
      updateMessage: (id) => {

        // get the message from the update input
        const message = $('#update-input').val();

        // make sure the message is not empty or just spaces.
        if (message.trim().length > 0) {

          // do a POST request with the message
          App.requests.updateMessage(message, id).done(() => {

            // close the editor
            App.dom.destoryEditor();

            // update the message on screen.
            $(`#payload-${id}`).html(message);
          });
        }
      },
      deleteMessage: (id) => {

        // function to run once the user responds to our sweet alert.
        const confirmDelete = function (result) {

          // if the user confirmed the action, delete the message.
          if (result.value) {
            App.requests.deleteMessage(id).done(() => {
              $(`#message-${id}`).remove();
            });
          }
          else {

            // else, report the cancelation.
            swal('Deletion canceled!', '', 'info');
          }
        };

        // options for the sweet alert.
        swalO = {
          title: 'Confirm',
          text: 'Are you sure you want to delete this message?',
          type: 'warning',
          showCancelButton: true,
        };

        // create the sweet alert.
        swal(swalO).then(confirmDelete);
      },
      setName: () => {

        // get the nickname from the input.
        const name = $('#name-input').val();

        // set the name to a cookie
        Utils.setCookie('nickname', name, 14);

        // update the app state
        App.state.name = name;

        // destroy the editor
        App.dom.destoryEditor();
		}
    },
    dom: {

      // adds a list of messages to the top of the chat stack
      prependMessagesToChat: (data) => {
        data.forEach((message) => {
          const html = App.templates.message(message.sender, message.messagebody, message.id, message.creationdate);
          App.elements.messages.prepend(html);
          App.state.lowIndex = message.id;
        });
      },

      // adds a list of messages to the bottom of the chat stack
      appendMessagesToChat: (data) => {
        console.log(data);
        data.forEach((message) => {
          const html = App.templates.message(message.sender, message.messagebody, message.sender === App.state.name);
          App.elements.messages.append(html);
        });
        App.dom.scrollToBottom();
      },

      // Empty the messaging input.
      clearMessageBox: () => {
        App.elements.input.val('');
      },

      // reveal the update message editor
      showEditor: (id) => {
        const message = $(`#message-${id}`);
        const text = message.data('message');
        $('body').prepend(App.templates.messageEditor(id, text));
      },

      // remove any overlays and editors.
      destoryEditor: () => {
        $('#overlay').addClass('d-none');
        $('#overlay').removeClass('d-flex');
        $('#overlay').html('');
      },

      // grey out the load message button and disable it's functionality
      disableLoader: () => {
        App.elements.loader.addClass('app-disabled');
        App.elements.loader.html('No more messages');
        App.elements.loader.attr('onclick', '');
      },

      // update the chat title
      updateName: () => {
        App.elements.name.html(App.state.name);
      },

		// scroll to the bottom of the chat.
		scrollToBottom: () => {
			App.elements.card.scrollTop(App.elements.card[0].scrollHeight);
		}
    },
    templates: {

      // a new message in the chat
      message: (name, message, id, creationdate) => {
        const isUser = name === App.state.name;
        return `
          <div class="app-message${isUser ? ' self' : ''}" id="message-${id}"
              data-sender="${name}" data-message="${message}" data-id="${id}" data-creationdate="${creationdate}">
            <div class="app-message-content">
              <div class="app-message-sender" id="sender-${id}">
                ${name}: <div class="app-message-payload" id="payload-${id}">${message}</div>
              </div>
            </div>
			<div class="message-info${isUser ? ' self' : ''}">
				<div class="message-meta d-flex">
				  <div class="app-message-timestamp small text-black-50">${moment(creationdate).format('ddd, MM/DD/YY @ hh:mm A')}</div>
				  <div class="app-message-timestamp-itsy-bitsy small text-black-50">${moment(creationdate).format('MM/DD/YY')}</div>
				  ${isUser ? `<div class="d-flex message-tools">
					<div class="app-message-tool mr-2 app-text message-edit" onclick="App.dom.showEditor(${id})">
					  <i class="fas fa-edit"></i>
					</div>
					<div class="app-message-tool mr-2 app-text" onclick="App.actions.deleteMessage(${id})">
					  <i class="fas fa-eraser"></i>
					</div>
				  </div>` : '<div></div>'}
				</div>
			</div>
          </div>`;
      },

      // the nickname editor
      nickname: () => {
        return `
          <div class="align-items-center h-100 justify-content-around position-absolute w-100 app-overlay d-none" id="overlay">
            <div id="name" class="rounded p-4 w-50 app-bg-p app-border text-white">
              <div class="mb-3">
                <h4>Who are you?</h4>
              </div>
              <div class="input-group input-group-lg mb-3">
                <div class="input-group-prepend">
                  <span class="input-group-text app-bg-p-dark text-light app-border">Nickname</span>
                </div>
                <input class="form-control" id="name-input" maxlength="24" />
              </div>
              <button class="btn app-btn-outline-s btn-block btn-lg" onclick="App.actions.setName()">Okay, let's chat</button>
            </div>
          </div>`;
      },

      // the udpate message editor
      messageEditor: (id, message) => {
        return `
          <div class="align-items-center h-100 justify-content-around position-absolute w-100 app-overlay d-flex" id="overlay">
            <div id="name" class="rounded p-4 w-50 app-bg-p app-border text-white">
              <div class="mb-3">
                <h4>Update</h4>
              </div>
              <div class="input-group input-group-lg mb-3">
                <input class="form-control" id="update-input" maxlength="140" value="${message}"/>
              </div>
              <div class="mb-3">
                <button class="btn app-btn-outline-s btn-block btn-lg" onclick="App.actions.updateMessage(${id})">Update!</button>
              </div>
              <div class="mb-3">
                <button class="btn app-btn-outline-s btn-block btn-lg" onclick="App.dom.destoryEditor()">Wait, cancel.</button>
              </div>
            </div>
          </div>`;
      }
    },
    elements: {

      // the messaging input
      input: $('#message-input'),

      // the message box with current messages
      messages: $('#message-board'),

      // the user's name on the chat title.
      name: $('#display-name'),

      // the "Load new messages" button
      loader: $('#load-messages'),

      // the entire chat module.
      card: $('.card-body')
    }
  }
}