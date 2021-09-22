var DEFAULT_GAME_FILENAME = 'js/game.zip';
 
 // Subtly hint at lack of WebAssembly support (if applicable)
if (typeof WebAssembly !== 'object') {

    var error_message = "Unsupported browser - please upgrade!\n(WebAssembly support needed)";
    document.body = document.createElement('body');
    document.body.innerHTML = error_message.replace('\n', '<br />');
    location.href = 'javascript:alert("' + error_message.replace('\n', '\\n') + '")';
    throw error_message;
    window.stop();
    // R.I.P.
}

// Clear error when running without server
if (location.href.startsWith('file://')) {
    alert("Error: El navegador requiere que el juego corra desde un servidor local HTTP(i.e. double-clicking on index.html won't work).");
}

// Work-around iframe focus
https://github.com/emscripten-core/emscripten/pull/7631
document.getElementById('canvas').addEventListener('mouseenter', function(e) {
  window.focus() 
});
document.getElementById('canvas').addEventListener('click', function(e) {
  window.focus() 
});

      /* Copyright (C) 2018, 2019, 2020, 2021  Sylvain Beucler */

      /* Context menu */
      document.getElementById('ContextButton').addEventListener('click', function (e) {
        var menu = document.getElementById('ContextMenu');
        if (menu.style.display == 'none')
          menu.style.display = 'block';
        else
          menu.style.display = 'none';
        e.preventDefault();
      });

      function onSavegamesImport(input) {
        reader = new FileReader();
        reader.onload = function(e) {
          FS.writeFile('savegames.zip', new Uint8Array(e.target.result));
          Module._emSavegamesImport();
          FS.syncfs(false, function(err) {
            if (err) {
              console.trace(); console.log(err, err.message);
              Module.print("Warning: cannot import savegames: write error: " + err.message + "\n");
            } else {
              Module.print("Saves imported - restart game to apply.\n");
            }
          });
        }
        reader.readAsArrayBuffer(input.files[0])
  input.type = ''; input.type = 'file'; // reset field
      }

      function onSavegamesExport() {
        ret = Module._emSavegamesExport();
        if (ret) {
          FSDownload('savegames.zip', 'application/zip');
        }
      }

      function gameExtractAndRun() {
        start = Date.now();
        var ret = Module.ccall('PyRun_SimpleString', 'number', ['string'], [
          "import zipfile\n" +
          "zip_ref = zipfile.ZipFile('game.zip', 'r')\n" +
          "zip_ref.extractall('.')\n" +
          "zip_ref.close()\n"
        ])
        if (ret != 0) {
            Module.setStatus("Error extracting .zip.");
            return;
        }
        FS.unlink('/game.zip')
        Module.print("Extracted in " + (Date.now()-start)/1000.0 + "s\n");

        if (FS.readdir('/').indexOf('game') < 0) {
            Module.setStatus("Invalid .zip (no top-level 'game' directory).");
            return;
        }

        // presplash
        presplash = undefined;
        if (FS.readdir('/').indexOf('web-presplash.png') >= 0) {
          presplash = FS.readFile('/web-presplash.png');
        } else if (FS.readdir('/').indexOf('web-presplash.jpg') >= 0) {
          presplash = FS.readFile('/web-presplash.jpg');
        } else if (FS.readdir('/').indexOf('web-presplash.webp') >= 0) {
          presplash = FS.readFile('/web-presplash.webp');
        } else if (FS.readdir('/').indexOf('web-presplash-default.jpg') >= 0) {
          presplash = FS.readFile('/web-presplash-default.jpg');
        }

        div = document.createElement('div');
        div.id = 'presplash';  // used by presplashEnd()
        div.style = 'position: absolute; width: 100%; height: 100%';
        c = document.getElementById('canvas');
        c.parentElement.prepend(div);

        if (presplash) {
          obj_url = window.URL.createObjectURL(new Blob([presplash]));
          img = document.createElement('img');
          img.src = obj_url;
          img.style = 'display: block; margin: auto; width: 100%; height: 100%; object-fit: contain';
          div.appendChild(img)
        } else {
          Module.print("Loading game, please wait...\n");
        }

        // give control back to webui before running main
        window.setTimeout(function() {
          Module.ccall('pyapp_runmain', '', [], [], {async: true})
        }, 200);  // smaller delay doesn't update the DOM, esp. on mobile
      }

      // hook for Ren'Py
      function presplashEnd() {
        document.getElementById('presplash').remove();
      }
      function FSDownload(filename, mimetype) {
        console.log('download', filename);
        var a = document.createElement('a');
        a.download = filename.replace(/.*\//, '');
        try {
          a.href = window.URL.createObjectURL(new Blob([FS.readFile(filename)],
                                                       { type: mimetype || '' }));
        } catch(e) {
          Module.print("Error opening " + filename + "\n");
          return;
        }
        document.body.appendChild(a);
        a.click();
        // delay clean-up to avoid iOS issue:
        // The operation couldn’t be completed. (WebKitBlobResourse error 1.)
        setTimeout(function() {
            window.URL.revokeObjectURL(a.href);
            document.body.removeChild(a);
        }, 1000);
      }

// Barra de estatus
      var statusElement = document.getElementById('status');
      var progressElement = document.getElementById('progress');
      var spinnerElement = document.getElementById('spinner');

      var Module = {
        preRun: [],
        postRun: [],
        print: (function() {
          var element = document.getElementById('status');
          return function(text) {
            if (arguments.length > 1) text = Array.prototype.slice.call(arguments).join(' ');
            console.log(text);
            // Esto es necesario si se necesita convertir archivo bruto raw
            text = String(text);
            text = text.replace(/&/g, "&amp;");
            text = text.replace(/</g, "&lt;");
            text = text.replace(/>/g, "&gt;");
            text = text.replace('\n', '<br />', 'g');
            element.innerHTML += text;

            statusbar = document.getElementById('statusbar');
            statusbar.hidden = false;
            var print_date = new Date();
            statusbar.date = print_date;
            window.setTimeout(function() {
              // Esconde el loader después de unos segundos - solo si setStatus no está activo
              if (Module.setStatus.last && Module.setStatus.last.text == ''
                  && statusbar.date == print_date) {
                element.innerHTML = ''; statusbar.hidden = true;
              }
            }, 3000);
          };
        })(),
        printErr: function(text) {
          if (arguments.length > 1) text = Array.prototype.slice.call(arguments).join(' ');
          if (0) { // XXX disabled for safety typeof dump == 'function') {
            dump(text + '\n'); // fast, straight to the real console
          } else {
            console.error(text);
          }
        },
        canvas: (function() {
          var canvas = document.getElementById('canvas');

          // As a default initial behavior, pop up an alert when webgl context is lost. To make your
          // application robust, you may want to override this behavior before shipping!
          // See http://www.khronos.org/registry/webgl/specs/latest/1.0/#5.15.2
          canvas.addEventListener("webglcontextlost", function(e) { alert('WebGL context lost. You will need to reload the page.'); e.preventDefault(); }, false);

          return canvas;
        })(),
        setStatus: function(text) {
          if (!Module.setStatus.last) Module.setStatus.last = { time: Date.now(), text: '' };
          if (text === Module.setStatus.last.text) return;
          var m = text.match(/([^(]+)\((\d+(\.\d+)?)\/(\d+)\)/);
          var now = Date.now();
          if (m && now - Module.setStatus.last.time < 30) return; // if this is a progress update, skip it if too soon
          Module.setStatus.last.time = now;
          Module.setStatus.last.text = text;
          if (m) {
            text = m[1];
            progressElement.value = parseInt(m[2])*100;
            progressElement.max = parseInt(m[4])*100;
            progressElement.hidden = false;
            spinnerElement.hidden = false;
          } else {
            progressElement.value = null;
            progressElement.max = null;
            progressElement.hidden = true;
            if (!text) spinnerElement.style.display = 'none';
          }
          if (text == '') {
            statusElement.innerHTML = '';
            document.getElementById('statusbar').hidden = true;
          } else {
            statusElement.innerHTML = text + '<br />';
            document.getElementById('statusbar').hidden = false;
          }
        },
        totalDependencies: 0,
        monitorRunDependencies: function(left) {
          this.totalDependencies = Math.max(this.totalDependencies, left);
          Module.setStatus(left ? 'Preparing... (' + (this.totalDependencies-left) + '/' + this.totalDependencies + ')' : 'All downloads complete.');
        }
      };
      Module.setStatus('Downloading...');
      window.onerror = function(event) {
        // TODO: do not warn on ok events like simulating an infinite loop or exitStatus
        //Module.setStatus('Exception thrown, see JavaScript console');
        // Explicitly display meaningful errors such as "uncaught exception: out of memory":

        var appleWarning = "";

        if (/RangeError/.test(event)) {
            appleWarning = "\n<p>This is a known issue in Safari and Webkit browsers. Please report this issue to Apple.";
        }

        Module.setStatus('Error: ' + event.split('\n')[0] + ' (see JavaScript console for details)' + appleWarning);
        spinnerElement.style.display = 'none';
        Module.setStatus = function(text) {
          if (text) Module.printErr('[post-exception status] ' + text);
        };
      };



      function create_persistent() {
        // populate savegames
        try {
          FS.mkdir('/home/web_user/.renpy');
          FS.mount(IDBFS, {}, '/home/web_user/.renpy');
        } catch(e) {
          console.log(e);
          Module.print("Could not create ~/.renpy/ : " + e.message + "\n");
        }
        FS.syncfs(true, function(err) {
          if (err) {
              console.trace(); console.log(err, err.message);
              // Note: not visible enough, quickly replaced by loading status
              Module.print("Warning: cannot save games\n");
          }
        });
      }
      if (Module['calledRun']) {
        create_persistent();
      } else {
        if (!Module['preRun']) Module['preRun'] = [];
        Module["preRun"].push(create_persistent); // FS is not initialized yet, wait for it
      }