import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import Confetti from 'react-confetti';
import html2canvas from 'html2canvas'; 
import './App.css';
import { QRCodeCanvas } from 'qrcode.react';
import logoImagen from './logo.png';

const socket = io('https://sin-careta-backend.onrender.com');

const ANIMALES = ['🦊','🐍','🐀','🦉','🐑','🦝','🦍','🐕','🐈','🐖','🐅','🦥','🦦','🦨','🦇','🦩','🦅','🦈','🐊','🦖','🦄','🐸','🐼','🐨'];
const LETRAS_OPCIONES = ['A)', 'B)', 'C)', 'D)', 'E)', 'F)'];

const NOMBRES_TEST = {
  TEST_A: '💀 El Dictador (Control)',
  TEST_B: '🧘‍♂️ Falso Zen (Positividad)',
  TEST_C: '🔪 Buda con Puñal (Agresión)',
  TEST_D: '🍻 Reglas de Barrio (Códigos)'
};

function generarToken() {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
}

function App() {
  const [pantalla, setPantalla] = useState('INICIO');
  const [cargando, setCargando] = useState(false);
  const [nombre, setNombre] = useState('');
  const [codigoSala, setCodigoSala] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('sala') || '';
  });
  const [avatarElegido, setAvatarElegido] = useState('🦊'); 

  // Token de sesión propio del dispositivo: se guarda en localStorage para
  // poder reconectarse a la misma identidad si se recarga la página.
  const [miToken] = useState(() => {
    let t = localStorage.getItem('sinCareta_token');
    if (!t) {
      t = generarToken();
      localStorage.setItem('sinCareta_token', t);
    }
    return t;
  });

  const [jugadores, setJugadores] = useState([]);
  const [miSala, setMiSala] = useState('');
  const [miId, setMiId] = useState('');
  
  const [testSeleccionado, setTestSeleccionado] = useState('TEST_D'); 
  const [parteSeleccionada, setParteSeleccionada] = useState(1); 

  // Qué test/parte se está jugando (o se jugó), para mostrarlo siempre en
  // pantalla y también antes de "Volver a empezar".
  const [infoPartida, setInfoPartida] = useState(null); // { idTest, parteInicial, extendida }

  const [preguntaActual, setPreguntaActual] = useState(null);
  const [tiempoRestante, setTiempoRestante] = useState(60);
  const [opcionElegida, setOpcionElegida] = useState(null);
  
  const [prediccionJugador, setPrediccionJugador] = useState('');
  const [prediccionOpcion, setPrediccionOpcion] = useState('');

  const [revelacionData, setRevelacionData] = useState([]);
  const [cuestionamientos, setCuestionamientos] = useState({});
  const [tiempoRevelacion, setTiempoRevelacion] = useState(15);
  const [acusado, setAcusado] = useState(null);
  const [respuestaAcusado, setRespuestaAcusado] = useState(''); 

  const [tiempoJuicio, setTiempoJuicio] = useState(30); 
  const [votoJuicio, setVotoJuicio] = useState(null);
  const [veredictoFinal, setVeredictoFinal] = useState('');

  const [testFinal, setTestFinal] = useState(null);
  const [acusacionUsada, setAcusacionUsada] = useState(false);

  // Se pone en true al tocar cualquier botón de avance en INTERMEDIO
  // (Finalizar / Extender / Siguiente pregunta) para que un doble tap no
  // dispare el mismo evento dos veces y salte una pregunta.
  const [avanzando, setAvanzando] = useState(false);

  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    const handleResize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Refs "espejo" de nombre/avatar: los usamos dentro del listener de
  // sockets (que solo se resuscribe cuando cambia miId) para no quedarnos
  // con un valor viejo de estos campos por el cierre (closure) del efecto.
  const nombreRef = useRef(nombre);
  useEffect(() => { nombreRef.current = nombre; }, [nombre]);
  const avatarRef = useRef(avatarElegido);
  useEffect(() => { avatarRef.current = avatarElegido; }, [avatarElegido]);

  const audiosRef = useRef(null);

  useEffect(() => {
    audiosRef.current = {
      click: new Audio('/sonidos/click.mp3'),
      alarma: new Audio('/sonidos/alarma.mp3'),
      gallina: new Audio('/sonidos/gallina.mp3'),
      martillazo: new Audio('/sonidos/martillazo.mp3'),
      tick: new Audio('/sonidos/tick.mp3')
    };
    audiosRef.current.tick.loop = true;

    return () => {
      Object.values(audiosRef.current).forEach(a => {
        a.pause();
        a.currentTime = 0;
      });
    };
  }, []);

  const reproducirSonido = (tipo, accion = 'play') => {
    if (!audiosRef.current || !audiosRef.current[tipo]) return;
    const audio = audiosRef.current[tipo];
    
    if (accion === 'play') {
      audio.currentTime = 0;
      audio.play().catch(e => console.log('Audio bloqueado:', e));
    } else if (accion === 'stop') {
      audio.pause();
      audio.currentTime = 0;
    }
  };

  useEffect(() => {
    if (pantalla !== 'PREGUNTA' && pantalla !== 'REVELACION' && pantalla !== 'TRIBUNAL') {
      reproducirSonido('tick', 'stop');
    }
  }, [pantalla]);

  // Si había una sesión guardada (misma sala, mismo token), reintentamos
  // unirnos automáticamente al cargar la página. Nota: esto reconecta la
  // IDENTIDAD del jugador (nombre, puntos, avatar) correctamente, pero la
  // pantalla local vuelve a 'LOBBY' hasta el próximo evento del servidor —
  // no reproduce en qué pregunta exacta estaba si el juego ya arrancó.
  useEffect(() => {
    const guardado = localStorage.getItem('sinCareta_sesion');
    if (!guardado) return;
    try {
      const sesion = JSON.parse(guardado);
      if (sesion.codigoSala && sesion.nombre) {
        setNombre(sesion.nombre);
        setAvatarElegido(sesion.avatar || '🦊');
        setCodigoSala(sesion.codigoSala);
        setMiSala(sesion.codigoSala);
        setCargando(true);
        socket.emit('unirse_sala', {
          codigoSala: sesion.codigoSala,
          nombreUsuario: sesion.nombre,
          avatar: sesion.avatar,
          token: miToken
        });
      }
    } catch (e) {
      localStorage.removeItem('sinCareta_sesion');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    socket.on('sala_creada', (data) => {
      setMiSala(data.codigoSala);
      setJugadores(data.jugadores);
      setMiId(socket.id);
      setCargando(false); 
      setPantalla('LOBBY');
      localStorage.setItem('sinCareta_sesion', JSON.stringify({
        codigoSala: data.codigoSala,
        nombre: nombreRef.current,
        avatar: avatarRef.current
      }));
    });

    socket.on('actualizar_jugadores', (data) => {
      setJugadores(data.jugadores);
      if (!miId) setMiId(socket.id);
      setCargando(false);
      // Si estábamos en INICIO (recién nos unimos, o recién nos
      // reconectamos), avanzamos a LOBBY. Si ya estábamos más avanzados
      // (este evento llegó porque OTRO jugador entró o se reconectó), no
      // tocamos la pantalla en la que ya estábamos.
      setPantalla(prev => prev === 'INICIO' ? 'LOBBY' : prev);
    });

    socket.on('error_conexion', (data) => { 
      alert(data.mensaje); 
      setCargando(false); 
      if (data.mensaje === 'Sala no encontrada') {
        localStorage.removeItem('sinCareta_sesion');
      }
    });

    socket.on('pantalla_reglas', (data) => { 
      setInfoPartida({ idTest: data?.testActivo?.id_test, parteInicial: data?.parte, extendida: false });
      setPantalla('REGLAS'); 
    }); 

    socket.on('nueva_pregunta', (data) => {
      const preg = data.pregunta;

      setPreguntaActual(preg);
      setInfoPartida({ idTest: preg.idTest, parteInicial: preg.parteInicial, extendida: preg.extendida });
      setOpcionElegida(null);
      setPrediccionJugador('');
      setPrediccionOpcion('');
      setAcusacionUsada(false); 
      setTiempoRestante(60);
      setAvanzando(false);
      setPantalla('PREGUNTA');
    });

    socket.on('mostrar_revelacion', (data) => {
      reproducirSonido('tick', 'stop'); 
      setRevelacionData(data.revelacion);
      setJugadores(data.jugadores);
      setCuestionamientos({});
      setAcusacionUsada(false); 
      setTiempoRevelacion(15); 
      setPantalla('REVELACION');
      
      const hayTibios = data.revelacion.some(r => r.esTibia);
      if (hayTibios) reproducirSonido('gallina');
    });

    socket.on('actualizar_cuestionamientos', (data) => { setCuestionamientos(data.cuestionamientos); });

    socket.on('fin_juicio', (data) => {
      reproducirSonido('tick', 'stop');
      setVeredictoFinal(data.resultado);
      setJugadores(data.jugadores);
      reproducirSonido('martillazo'); 
      setTimeout(() => {
        setPantalla('INTERMEDIO');
        setVeredictoFinal('');
        setVotoJuicio(null);
      }, 5000);
    });

    socket.on('juego_terminado', (data) => {
      reproducirSonido('tick', 'stop');
      setJugadores(data.jugadores);
      setTestFinal(data.testActivo);
      setInfoPartida({ idTest: data.testActivo?.id_test, parteInicial: data.parteInicial, extendida: data.extendida });
      setAvanzando(false);
      setPantalla('RESULTADOS');
    });

    return () => {
      socket.off('sala_creada');
      socket.off('actualizar_jugadores');
      socket.off('error_conexion');
      socket.off('pantalla_reglas');
      socket.off('nueva_pregunta');
      socket.off('mostrar_revelacion');
      socket.off('actualizar_cuestionamientos');
      socket.off('fin_juicio');
      socket.off('juego_terminado');
    };
  }, [miId]);

  const opcionesVisibles = preguntaActual?.opciones
    ? preguntaActual.opciones.filter(o => !preguntaActual.es_fuego_cruzado || o.id_opcion !== miId)
    : [];

  useEffect(() => {
    let timer;
    if (pantalla === 'PREGUNTA' && tiempoRestante > 0 && !opcionElegida) {
      timer = setTimeout(() => setTiempoRestante((t) => t - 1), 1000);
      if (tiempoRestante === 10) reproducirSonido('tick', 'play');
    } 
    else if (pantalla === 'PREGUNTA' && tiempoRestante === 0 && !opcionElegida) {
      reproducirSonido('tick', 'stop');
      if (opcionesVisibles.length > 0) {
        const azar = opcionesVisibles[Math.floor(Math.random() * opcionesVisibles.length)].id_opcion;
        enviarRespuesta(azar);
      }
    }
    else if (pantalla === 'REVELACION' && tiempoRevelacion > 0) {
      timer = setTimeout(() => setTiempoRevelacion((t) => t - 1), 1000);
      if (tiempoRevelacion === 5) reproducirSonido('tick', 'play');
    } 
    else if (pantalla === 'REVELACION' && tiempoRevelacion === 0) {
      reproducirSonido('tick', 'stop');
      let maxVotos = 0;
      let idAcusado = null;
      
      Object.keys(cuestionamientos).forEach(id => {
        const votos = cuestionamientos[id].length;
        if (votos >= 2 && votos > maxVotos) {
          maxVotos = votos;
          idAcusado = id;
        }
      });

      if (idAcusado) {
        const jug = jugadores.find(j => j.id === idAcusado);
        const dataRevAcusado = revelacionData.find(r => r.idJugador === idAcusado);
        setAcusado(jug);
        setRespuestaAcusado(dataRevAcusado?.opcionElegida?.texto || '');
        setTiempoJuicio(30); 
        setPantalla('TRIBUNAL'); 
      } else {
        setPantalla('INTERMEDIO'); 
      }
    }
    else if (pantalla === 'TRIBUNAL' && tiempoJuicio > 0 && !veredictoFinal) {
      timer = setTimeout(() => setTiempoJuicio((t) => t - 1), 1000);
      if (tiempoJuicio === 10) reproducirSonido('tick', 'play');
    }
    else if (pantalla === 'TRIBUNAL' && tiempoJuicio === 0 && !veredictoFinal) {
      reproducirSonido('tick', 'stop');
      if (!votoJuicio) emitirVotoJuicio('SALVADO');
    }
    return () => clearTimeout(timer);
  }, [pantalla, tiempoRestante, opcionElegida, tiempoRevelacion, tiempoJuicio, cuestionamientos, jugadores, veredictoFinal, revelacionData, preguntaActual]);

  const crearSala = () => {
    if (!nombre.trim()) return alert('¡Ponete un nombre, careta!');
    setCargando(true);
    reproducirSonido('click');
    socket.emit('crear_sala', { nombreUsuario: nombre, avatar: avatarElegido, token: miToken });
  };

  const unirseSala = () => {
    if (!nombre.trim()) return alert('¡Ponete un nombre, careta!');
    if (!codigoSala.trim()) return alert('Ingresá el código de la sala');
    const codigo = codigoSala.trim().toUpperCase();
    setCargando(true);
    reproducirSonido('click');
    socket.emit('unirse_sala', { codigoSala: codigo, nombreUsuario: nombre, avatar: avatarElegido, token: miToken });
    setMiSala(codigo);
    localStorage.setItem('sinCareta_sesion', JSON.stringify({ codigoSala: codigo, nombre, avatar: avatarElegido }));
  };

  const prepararJuego = () => {
    reproducirSonido('click');
    socket.emit('preparar_juego', { codigoSala: miSala, idTest: testSeleccionado, parte: parteSeleccionada });
  };

  const iniciarJuego = () => {
    reproducirSonido('click');
    socket.emit('iniciar_juego', { codigoSala: miSala });
  };

  const enviarRespuesta = (idOpcion) => {
    reproducirSonido('tick', 'stop');
    reproducirSonido('click');
    setOpcionElegida(idOpcion);
    const prediccion = (prediccionJugador && prediccionOpcion) ? { jugadorObjetivoId: prediccionJugador, opcionAdivinadaId: prediccionOpcion } : null;
    socket.emit('enviar_respuesta', { codigoSala: miSala, idOpcion, prediccion });
  };

  const hundirBotonMentira = (idJugadorMentiroso) => {
    if (!acusacionUsada) {
      reproducirSonido('alarma');
      socket.emit('cuestionar_jugador', { codigoSala: miSala, idJugadorAcusado: idJugadorMentiroso });
      setAcusacionUsada(true); 
    }
  };

  const emitirVotoJuicio = (voto) => {
    reproducirSonido('tick', 'stop');
    reproducirSonido('click');
    setVotoJuicio(voto);
    socket.emit('votar_juicio', { codigoSala: miSala, idAcusado: acusado.id, voto });
  };

  const finalizarJuegoManualmente = () => {
    if (avanzando) return;
    setAvanzando(true);
    reproducirSonido('click');
    socket.emit('finalizar_juego', { codigoSala: miSala });
  };

  const extenderA30Preguntas = () => {
    if (avanzando) return;
    setAvanzando(true);
    reproducirSonido('click');
    socket.emit('extender_ronda', { codigoSala: miSala });
  };

  const siguientePregunta = () => {
    if (avanzando) return;
    setAvanzando(true);
    reproducirSonido('click');
    socket.emit('siguiente_pregunta', { codigoSala: miSala });
  };

  const descargarProntuario = () => {
    reproducirSonido('click');
    const elemento = document.getElementById('prontuario-export');
    html2canvas(elemento, { backgroundColor: '#1A1A2E', scale: 2 }).then((canvas) => {
      const link = document.createElement('a');
      link.download = `SinCareta_${nombre}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    });
  };

  let miJugador = null;
  let miPerfil = null;
  let jugadoresOrdenados = [...jugadores].sort((a, b) => b.puntos - a.puntos);

  if (pantalla === 'RESULTADOS' && testFinal) {
    miJugador = jugadores.find(j => j.id === miId);
    if (miJugador) {
      miPerfil = testFinal.perfiles_resultado.find(p => miJugador.puntos >= p.rango_min && miJugador.puntos <= p.rango_max);
    }
  }

  const nombrePartida = infoPartida?.idTest
    ? `${NOMBRES_TEST[infoPartida.idTest] || infoPartida.idTest} · Parte ${infoPartida.parteInicial}${infoPartida.extendida ? ' + 2' : ''}`
    : '';

  const estiloOpcion = { background: '#1A1A2E', color: '#FFFFFF' };

  const estilos = {
    contenedor: { background: 'radial-gradient(circle at 50% 0%, #2A0845 0%, #0F041C 100%)', color: '#FFFFFF', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, -apple-system, sans-serif', padding: '20px', boxSizing: 'border-box' },
    tarjetaGlass: { background: 'rgba(255, 255, 255, 0.03)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '24px', padding: '30px', boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.4)', width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 10 },
    titulo: { fontSize: '4.2rem', fontWeight: '900', background: 'linear-gradient(90deg, #FF007A 0%, #7A00FF 50%, #00FFA3 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: '0', textAlign: 'center', zIndex: 10, letterSpacing: '4px', padding: '10px 0', lineHeight: '1.2', filter: 'drop-shadow(0px 4px 15px rgba(255, 0, 122, 0.6))' },
    subtitulo: { color: '#00FFA3', marginBottom: '30px', zIndex: 10, fontWeight: '700', fontSize: '0.9rem', letterSpacing: '3px', textTransform: 'uppercase', textShadow: '0 0 10px rgba(0, 255, 163, 0.5)', textAlign: 'center' },
    input: { padding: '16px', fontSize: '1.1rem', background: 'rgba(0, 0, 0, 0.2)', color: '#FFF', border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: '16px', marginBottom: '15px', width: '100%', textAlign: 'center', outline: 'none', transition: 'border 0.3s' },
    botonPrincipal: { padding: '16px 30px', fontSize: '1.2rem', fontWeight: '800', background: 'linear-gradient(45deg, #FF007A, #7A00FF)', color: '#FFF', border: 'none', borderRadius: '30px', boxShadow: '0 4px 15px rgba(255, 0, 122, 0.4)', cursor: 'pointer', width: '100%', marginBottom: '15px', transition: 'transform 0.2s, boxShadow 0.2s' },
    botonSecundario: { padding: '16px 30px', fontSize: '1.2rem', fontWeight: '800', background: 'linear-gradient(45deg, #00FFA3, #00B8FF)', color: '#000', border: 'none', borderRadius: '30px', boxShadow: '0 4px 15px rgba(0, 255, 163, 0.4)', cursor: 'pointer', width: '100%', marginBottom: '15px' },
    botonInstagram: { padding: '12px 20px', fontSize: '1rem', fontWeight: '800', background: 'linear-gradient(45deg, #F58529, #DD2A7B, #8134AF)', color: '#FFF', border: 'none', borderRadius: '30px', cursor: 'pointer', width: '100%', maxWidth: '300px', marginBottom: '15px', boxShadow: '0 4px 15px rgba(221, 42, 123, 0.4)' },
    botonMentira: (usado) => ({ padding: '12px', fontSize: '1rem', fontWeight: '800', background: usado ? 'rgba(255, 255, 255, 0.1)' : 'linear-gradient(45deg, #FF007A, #FF4B2B)', color: usado ? '#888' : '#FFF', border: 'none', borderRadius: '12px', boxShadow: usado ? 'none' : '0 4px 15px rgba(255, 0, 122, 0.3)', cursor: usado ? 'not-allowed' : 'pointer', marginTop: '15px', width: '100%' }),
    botonOpcion: (seleccionada, bloqueado, esFuegoCruzado) => ({ padding: '16px', fontSize: '1.1rem', fontWeight: '600', background: seleccionada ? 'rgba(0, 255, 163, 0.1)' : (esFuegoCruzado ? 'rgba(255, 0, 122, 0.1)' : 'rgba(255, 255, 255, 0.05)'), color: seleccionada ? '#00FFA3' : '#FFF', border: seleccionada ? '2px solid #00FFA3' : (esFuegoCruzado ? '1px solid rgba(255, 0, 122, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)'), borderRadius: '16px', boxShadow: seleccionada ? '0 0 15px rgba(0, 255, 163, 0.2)' : 'none', cursor: bloqueado ? 'not-allowed' : 'pointer', width: '100%', marginBottom: '12px', textAlign: 'left', opacity: (bloqueado && !seleccionada) ? 0.4 : 1 }),
    reloj: (tiempo) => ({ fontSize: '3rem', fontWeight: '900', color: tiempo <= 10 ? '#FF007A' : '#00FFA3', textShadow: tiempo <= 10 ? '0 0 20px rgba(255,0,122,0.6)' : '0 0 20px rgba(0,255,163,0.4)', marginBottom: '20px' }),
    tarjetaRevelacion: { background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(255, 255, 255, 0.05)', padding: '20px', borderRadius: '16px', marginBottom: '15px', width: '100%', display: 'flex', flexDirection: 'column' },
    badgeJuego: { position: 'fixed', top: '10px', right: '10px', background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.15)', color: '#00FFA3', fontSize: '0.75rem', fontWeight: '700', padding: '6px 12px', borderRadius: '20px', zIndex: 30, letterSpacing: '0.5px', textAlign: 'right' }
  };

  return (
    <div style={estilos.contenedor}>
      {infoPartida?.idTest && pantalla !== 'INICIO' && pantalla !== 'LOBBY' && (
        <div style={estilos.badgeJuego}>🎮 {nombrePartida}</div>
      )}

      {pantalla === 'RESULTADOS' && (
        <Confetti width={windowSize.width} height={windowSize.height} colors={['#00FFA3', '#FF007A', '#7A00FF', '#00B8FF', '#FFD700']} recycle={false} numberOfPieces={600} />
      )}

      {pantalla !== 'PREGUNTA' && pantalla !== 'REVELACION' && pantalla !== 'TRIBUNAL' && pantalla !== 'RESULTADOS' && (
        <>
          <img src={logoImagen} alt="Logo Sin Careta" style={{ width: '100%', maxWidth: '350px', aspectRatio: '1/1', objectFit: 'cover', borderRadius: '50%', marginBottom: '20px', boxShadow: '0 0 30px rgba(0, 255, 163, 0.3)' }} />
          <p style={estilos.subtitulo}>El simulador de destrucción de amistades</p>
        </>
      )}

      {pantalla === 'INICIO' && (
        <div style={estilos.tarjetaGlass}>
          <p style={{color: '#FFF', fontWeight: 'bold', marginBottom: '10px'}}>Elegí tu Espíritu Animal:</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px', marginBottom: '20px', maxWidth: '300px' }}>
            {ANIMALES.map(a => (
              <button key={a} onClick={() => {reproducirSonido('click'); setAvatarElegido(a);}} style={{ background: avatarElegido === a ? '#00FFA3' : 'rgba(255,255,255,0.05)', border: avatarElegido === a ? '2px solid #FFF' : '1px solid transparent', borderRadius: '8px', fontSize: '1.5rem', padding: '8px', cursor: 'pointer', transition: 'all 0.2s' }}>
                {a}
              </button>
            ))}
          </div>

          <input style={estilos.input} placeholder="Tu apodo" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={12} />
          <button style={{...estilos.botonPrincipal, opacity: cargando ? 0.7 : 1}} onClick={crearSala} disabled={cargando}>
            {cargando ? 'CONECTANDO...' : 'CREAR SALA'}
          </button>
          
          <div style={{ margin: '15px 0', width: '100%', borderTop: '1px solid rgba(255,255,255,0.1)' }}></div>
          
          <input style={estilos.input} placeholder="CÓDIGO (Ej: RATA-123)" value={codigoSala} onChange={(e) => setCodigoSala(e.target.value)} maxLength={8} />
          <button style={{...estilos.botonSecundario, opacity: cargando ? 0.7 : 1}} onClick={unirseSala} disabled={cargando}>
            {cargando ? 'CONECTANDO...' : 'UNIRSE'}
          </button>
        </div>
      )}

      {pantalla === 'LOBBY' && (
        <div style={estilos.tarjetaGlass}>
          <h2 className="texto-neon-pulsante" style={{ color: '#00FFA3', marginBottom: '5px', letterSpacing: '2px', fontSize: '2rem' }}>SALA: {miSala}</h2>
          
          <div style={{ background: '#FFF', padding: '10px', borderRadius: '12px', display: 'inline-block', marginBottom: '10px', marginTop: '10px' }}>
            <QRCodeCanvas value={`https://frontend-sin-careta.vercel.app/?sala=${miSala}`} size={140} level={"H"} />
          </div>
          <p style={{ color: '#00FFA3', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '25px', textTransform: 'uppercase' }}>¡Escaneá para unirte directo!</p>

          <p className="texto-esperando" style={{ color: '#A09FB1', marginBottom: '25px', fontWeight: 'bold' }}>Esperando a los mentirosos...</p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', marginBottom: '30px' }}>
            {jugadores.map((j, i) => (
              <div key={i} className="tarjeta-jugador-animada" style={{background: 'rgba(0,0,0,0.4)', borderLeft: j.id === miId ? '4px solid #00FFA3' : '4px solid transparent', padding: '12px 20px', borderRadius: '12px', fontWeight: '600', display: 'flex', justifyContent: 'space-between', animationDelay: `${i * 0.1}s`, opacity: j.conectado === false ? 0.5 : 1}}>
                <span style={{ fontSize: '1.1rem' }}>{j.avatar} {j.nombre} {j.pinocho ? '🤥' : ''} {j.puntos >= 30 ? '🔥' : ''} {j.conectado === false ? '🔌' : ''}</span>
                <span style={{ color: '#00FFA3', fontSize: '1.1rem' }}>{j.puntos} pts</span>
              </div>
            ))}
          </div>

          {jugadores.find(j => j.id === miId)?.esAnfitrion ? (
            <div style={{ width: '100%' }}>
              <select style={estilos.input} value={testSeleccionado} onChange={(e) => setTestSeleccionado(e.target.value)}>
                {Object.entries(NOMBRES_TEST).map(([id, label]) => (
                  <option key={id} value={id} style={estiloOpcion}>{label}</option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                <button style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #00FFA3', background: parteSeleccionada === 1 ? '#00FFA3' : 'transparent', color: parteSeleccionada === 1 ? '#000' : '#FFF', fontWeight: 'bold', cursor: 'pointer' }} onClick={() => setParteSeleccionada(1)}>PARTE 1</button>
                <button style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #FF007A', background: parteSeleccionada === 2 ? '#FF007A' : 'transparent', color: parteSeleccionada === 2 ? '#000' : '#FFF', fontWeight: 'bold', cursor: 'pointer' }} onClick={() => setParteSeleccionada(2)}>PARTE 2</button>
              </div>
              <button className="boton-anfitrion-animado" style={estilos.botonPrincipal} onClick={prepararJuego}>EMPEZAR PREVIA</button>
            </div>
          ) : (
            <p className="texto-esperando" style={{color: '#00FFA3', fontWeight: 'bold'}}>El anfitrión está armando el juego...</p>
          )}
        </div>
      )}

      {pantalla === 'REGLAS' && (
        <div style={{...estilos.tarjetaGlass, maxWidth: '500px'}}>
          <h2 style={{ color: '#FF007A', marginBottom: '15px', fontWeight: '900', fontSize: '1.8rem', textAlign: 'center' }}>⚠️ ADVERTENCIA LEGAL ⚠️</h2>
          <div style={{ background: 'rgba(0,0,0,0.4)', padding: '20px', borderRadius: '12px', color: '#E0E0E0', fontSize: '1.05rem', lineHeight: '1.6', marginBottom: '25px', textAlign: 'left' }}>
            <p style={{marginTop: 0}}>Al tocar Aceptar, renunciás a tu derecho a ofenderte.</p>
            <ul style={{ paddingLeft: '20px', marginBottom: 0 }}>
              <li style={{marginBottom: '10px'}}><strong>Acá no se llora:</strong> Si te enojás, perdés. Es un juego.</li>
              <li style={{marginBottom: '10px'}}><strong>La Bala de Plata:</strong> Tenés UNA (1) sola oportunidad por ronda para gritar <i>¡MENTIRA!</i>. Usala con sabiduría.</li>
              <li style={{marginBottom: '10px'}}><strong>El Voto Traidor:</strong> Mientras esperás, podés apostar quién va a mentir. Si acertás, le restás puntos.</li>
              <li><strong>Lo que pasa en Sin Careta, queda en Sin Careta.</strong></li>
            </ul>
          </div>

          {jugadores.find(j => j.id === miId)?.esAnfitrion ? (
            <button style={estilos.botonPrincipal} onClick={iniciarJuego}>ACEPTO LOS RIESGOS</button>
          ) : (
            <p style={{color: '#00FFA3', fontWeight: 'bold'}}>Esperando que el anfitrión firme el contrato...</p>
          )}
        </div>
      )}

      {pantalla === 'PREGUNTA' && preguntaActual && (
        <div style={{ width: '100%', maxWidth: '600px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={estilos.reloj(tiempoRestante)}>{tiempoRestante}</div>
          
          <div style={{ alignSelf: 'flex-start', marginBottom: '20px' }}>
            <span style={{ background: 'rgba(255, 255, 255, 0.1)', color: '#00FFA3', padding: '6px 14px', fontWeight: '700', borderRadius: '20px', fontSize: '0.9rem', letterSpacing: '1px' }}>
              Ronda {preguntaActual.numero} de {preguntaActual.total}
            </span>
          </div>
          
          <h2 style={{ fontSize: '1.5rem', lineHeight: '1.4', marginBottom: '30px', fontWeight: '600', color: preguntaActual.es_fuego_cruzado ? '#FF007A' : '#FFF', whiteSpace: 'pre-line' }}>{preguntaActual.texto}</h2>

          {!opcionElegida && jugadores.length > 2 && !preguntaActual.es_fuego_cruzado && (
            <div style={{...estilos.tarjetaGlass, background: 'rgba(0, 255, 163, 0.05)', border: '1px solid rgba(0, 255, 163, 0.2)', padding: '20px', marginBottom: '25px'}}>
              <span style={{color: '#00FFA3', fontWeight: '700', fontSize: '0.9rem', marginBottom: '15px'}}>🕵️ VOTO TRAIDOR (Optativo: Acertá y restá 2 pts)</span>
              <select style={estilos.input} value={prediccionJugador} onChange={(e) => setPrediccionJugador(e.target.value)}>
                <option value="" style={estiloOpcion}>¿Quién va a mentir?</option>
                {jugadores.filter(j => j.id !== miId).map(j => (<option key={j.id} value={j.id} style={estiloOpcion}>{j.avatar} {j.nombre}</option>))}
              </select>
              {prediccionJugador && (
                <select style={{...estilos.input, marginBottom: 0}} value={prediccionOpcion} onChange={(e) => setPrediccionOpcion(e.target.value)}>
                  <option value="" style={estiloOpcion}>¿Qué va a responder?</option>
                  {preguntaActual.opciones?.map((o, index) => (
                    <option key={o.id_opcion || index} value={o.id_opcion} style={estiloOpcion}>
                      Opción {LETRAS_OPCIONES[index] || String.fromCharCode(65 + index)}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
            {opcionesVisibles.map((opt, index) => (
              <button key={opt.id_opcion || index} style={estilos.botonOpcion(opcionElegida === opt.id_opcion, opcionElegida !== null, preguntaActual.es_fuego_cruzado)} onClick={() => !opcionElegida && enviarRespuesta(opt.id_opcion)} disabled={opcionElegida !== null}>
                {!preguntaActual.es_fuego_cruzado && (
                   <strong style={{color: opcionElegida === opt.id_opcion ? '#00FFA3' : '#FF007A', marginRight: '10px'}}>{LETRAS_OPCIONES[index] || `${String.fromCharCode(65 + index)})`}</strong> 
                )}
                {opt.texto}
              </button>
            ))}
          </div>
        </div>
      )}

      {pantalla === 'REVELACION' && (
        <div style={{ width: '100%', maxWidth: '600px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h2 style={{ color: '#FF007A', fontSize: '2.5rem', marginBottom: '5px', letterSpacing: '2px', fontWeight: '900', textShadow: '0 0 15px rgba(255,0,122,0.5)' }}>ESCRACHE</h2>
          <div style={estilos.reloj(tiempoRevelacion)}>{tiempoRevelacion}</div>
          
          <div style={{ width: '100%' }}>
            {revelacionData.map((rev, index) => {
              const jugadorInfo = jugadores.find(j => j.id === rev.idJugador);
              return (
                <div key={index} style={estilos.tarjetaRevelacion}>
                  <span style={{ fontSize: '1.2rem', fontWeight: '800', color: '#00FFA3' }}>
                    {rev.avatar} {rev.nombreJugador} {jugadorInfo?.puntos >= 30 ? '🔥' : ''}
                  </span>
                  <span style={{ marginTop: '10px', fontSize: '1.1rem', color: '#E0E0E0' }}>Eligió: <i>"{rev.opcionElegida.texto}"</i></span>
                  
                  {rev.esTibia && (
                    <div className="alerta-tibio-animada">
                      🐔 ¡ALERTA: TIBIO DETECTADO! 🐔
                    </div>
                  )}
                  
                  {rev.idJugador !== miId && !preguntaActual?.es_fuego_cruzado && (
                    <button style={estilos.botonMentira(acusacionUsada)} onClick={() => !acusacionUsada && hundirBotonMentira(rev.idJugador)} disabled={acusacionUsada}>
                      {acusacionUsada ? '💥 BALA DE PLATA GASTADA' : `🚨 ¡MENTIRA! (${cuestionamientos[rev.idJugador]?.length || 0} Votos)`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {pantalla === 'TRIBUNAL' && (
        <div style={{ width: '100%', maxWidth: '500px', textAlign: 'center' }}>
          <h1 className="latido-corazon" style={{ color: '#FF007A', fontSize: '3.5rem', fontWeight: '900', letterSpacing: '2px' }}>EL TRIBUNAL</h1>
          <h2 style={{ color: '#FFF', marginBottom: '10px', fontWeight: '500' }}>Acusado: <span style={{color: '#00FFA3', fontSize: '2rem', fontWeight: '800'}}>{acusado?.avatar} {acusado?.nombre}</span></h2>
          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '12px', marginBottom: '25px', fontStyle: 'italic' }}>"{respuestaAcusado}"</div>
          
          {!veredictoFinal ? (
            <>
              <div style={estilos.reloj(tiempoJuicio)}>{tiempoJuicio}</div>
              {miId === acusado?.id ? (
                <div style={{ background: 'linear-gradient(45deg, #FF007A, #FF4B2B)', padding: '25px', borderRadius: '16px', boxShadow: '0 0 20px rgba(255,0,122,0.4)' }}>
                  <h3 style={{ color: '#FFF', fontWeight: '900', fontSize: '1.5rem', marginBottom: '10px' }}>¡SOS EL ACUSADO!</h3>
                  <p style={{fontWeight: '500', fontSize: '1.1rem'}}>Tenés 30 segundos para defenderte a viva voz. ¡Convencelos de tu inocencia!</p>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '15px', marginTop: '20px' }}>
                  <button style={{ ...estilos.botonSecundario, padding: '15px', flex: 1 }} onClick={() => emitirVotoJuicio('SALVADO')} disabled={votoJuicio !== null}>
                    {votoJuicio === 'SALVADO' ? '✅ VOTASTE INOCENTE' : '👼 INOCENTE'}
                  </button>
                  <button style={{ ...estilos.botonPrincipal, padding: '15px', flex: 1, marginBottom: 0 }} onClick={() => emitirVotoJuicio('MINTIO')} disabled={votoJuicio !== null}>
                    {votoJuicio === 'MINTIO' ? '✅ VOTASTE CULPABLE' : '🤥 CULPABLE'}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div style={{ background: veredictoFinal === 'MINTIO' ? 'linear-gradient(45deg, #FF007A, #FF4B2B)' : 'linear-gradient(45deg, #00FFA3, #00B8FF)', padding: '35px', borderRadius: '20px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
              <h2 style={{ color: veredictoFinal === 'MINTIO' ? '#FFF' : '#000', fontSize: '3rem', fontWeight: '900' }}>
                {veredictoFinal === 'MINTIO' ? '¡CULPABLE! (+10 pts)' : '¡SALVADO!'}
              </h2>
            </div>
          )}
        </div>
      )}

      {pantalla === 'INTERMEDIO' && (
        <div style={estilos.tarjetaGlass}>
          <h2 style={{ color: '#00FFA3', marginBottom: '25px', fontWeight: '800' }}>Fin de la Pregunta {preguntaActual?.numero}</h2>
          <div style={{ width: '100%', marginBottom: '30px' }}>
            <h3 style={{ color: '#A09FB1', fontSize: '0.9rem', textTransform: 'uppercase', marginBottom: '15px' }}>Tabla de Toxicidad:</h3>
            
            {[...jugadores]
              .sort((a, b) => b.puntos - a.puntos)
              .map((j, i) => (
                <div key={j.id || i} style={{ background: 'rgba(0,0,0,0.3)', padding: '12px 15px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', marginBottom: '8px', opacity: j.conectado === false ? 0.5 : 1 }}>
                  <span style={{fontWeight: '600'}}>{j.avatar} {j.nombre} {j.pinocho ? '🤥' : ''} {j.puntos >= 30 ? '🔥' : ''} {j.conectado === false ? '🔌' : ''}</span>
                  <span style={{color: '#00FFA3', fontWeight: '800'}}>{j.puntos} pts</span>
                </div>
              ))}
          </div>

          {jugadores.find(j => j.id === miId)?.esAnfitrion ? (
            <div style={{ width: '100%' }}>
              {preguntaActual?.fin_de_bloque ? (
                <>
                  <p style={{ color: '#FFD700', fontWeight: 'bold', marginBottom: '15px', textAlign: 'center' }}>
                    ¡Completaron las {preguntaActual.total} preguntas iniciales! ¿Qué desean hacer?
                  </p>
                  <button style={{...estilos.botonPrincipal, opacity: avanzando ? 0.6 : 1}} onClick={finalizarJuegoManualmente} disabled={avanzando}>
                    🏁 FINALIZAR Y VER RESULTADOS
                  </button>
                  <button style={{...estilos.botonSecundario, opacity: avanzando ? 0.6 : 1}} onClick={extenderA30Preguntas} disabled={avanzando}>
                    🚀 EXTENDER A 30 PREGUNTAS
                  </button>
                </>
              ) : (
                <button style={{...estilos.botonPrincipal, opacity: avanzando ? 0.6 : 1}} onClick={siguientePregunta} disabled={avanzando}>
                  SIGUIENTE PREGUNTA
                </button>
              )}
            </div>
          ) : (
            <p style={{ color: '#A09FB1' }}>Esperando que el anfitrión avance...</p>
          )}
        </div>
      )}

      {pantalla === 'RESULTADOS' && miPerfil && (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 10, paddingBottom: '40px' }}>
          
          <div id="prontuario-export" className="prontuario-instagram">
            <div className="sello-clasificacion">{miPerfil.sello}</div>
            
            <p style={{ fontSize: '1rem', textTransform: 'uppercase', color: '#00FFA3', fontWeight: '800', letterSpacing: '2px', marginBottom: '15px' }}>
              ⚠️ EXPEDIENTE TÓXICO ⚠️
            </p>
            
            <div style={{ background: 'rgba(0,0,0,0.4)', padding: '20px', borderRadius: '16px', marginBottom: '20px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <p style={{ fontSize: '1.1rem', fontWeight: '600', color: '#A09FB1', margin: '0 0 10px 0' }}>
                Acusado: <span style={{ color: '#FFF', fontSize: '1.4rem', fontWeight: '900', display: 'block', marginTop: '5px' }}>{miJugador.avatar} {miJugador.nombre}</span>
              </p>
              <p style={{ fontSize: '1.1rem', fontWeight: '600', color: '#A09FB1', margin: '0 0 10px 0' }}>
                Nivel de Maldad: <span style={{ color: '#FF007A', fontWeight: '900', fontSize: '1.3rem' }}>{miJugador.puntos} pts {miJugador.puntos >= 30 ? '🔥' : ''}</span>
              </p>
              {miJugador.medalla && (
                <p style={{ fontSize: '1.1rem', fontWeight: '600', color: '#FFD700', margin: '15px 0 0 0', borderTop: '1px solid rgba(255,215,0,0.3)', paddingTop: '10px' }}>
                  Distinción Especial: <br/><span style={{ fontSize: '0.9rem', color: '#FFF', display: 'block', marginTop: '5px' }}>{miJugador.medalla}</span>
                </p>
              )}
            </div>
            
            <h2 style={{ fontSize: '1.8rem', fontWeight: '900', lineHeight: '1.2', marginBottom: '15px', color: '#FFF', textShadow: '0 0 10px rgba(255,255,255,0.2)' }}>
              "{miPerfil.titulo}"
            </h2>
            <p style={{ fontSize: '1.05rem', lineHeight: '1.6', color: '#E0E0E0', fontWeight: '500' }}>
              {miPerfil.descripcion}
            </p>

            <div className="marca-agua-ig">
              <h4>SIN CARETA</h4>
              <span className="link-juego">https://frontend-sin-careta.vercel.app</span>
            </div>
          </div>

          <button style={{...estilos.botonInstagram, padding: '16px 20px', fontSize: '1.1rem'}} onClick={descargarProntuario}>
            📸 COMPARTIR EN INSTAGRAM
          </button>
          
          <button 
            style={{ ...estilos.botonSecundario, marginTop: '10px', maxWidth: '300px', background: 'linear-gradient(45deg, #FFD700, #FFA500)', color: '#000', boxShadow: '0 5px 20px rgba(255, 215, 0, 0.4)' }} 
            onClick={() => { reproducirSonido('click'); window.open('https://cafecito.app/sin_careta', '_blank'); }}
          >
            🍻 ¿TE REÍSTE? PAGÁ UNA BIRRA
          </button>

          <div style={{ width: '100%', height: '1px', background: 'rgba(255,255,255,0.1)', margin: '30px 0' }}></div>

          <h3 style={{ color: '#00FFA3', marginBottom: '20px', fontSize: '1.1rem', letterSpacing: '2px', textTransform: 'uppercase' }}>🏆 Ranking Final</h3>
          
          <div style={{ width: '100%', maxWidth: '380px', marginBottom: '40px' }}>
            {jugadoresOrdenados.map((j, i) => (
              <div key={j.id || i} style={{ background: i === 0 ? 'linear-gradient(45deg, #FF007A, #7A00FF)' : 'rgba(255,255,255,0.05)', color: '#FFF', padding: '15px 20px', borderRadius: '12px', marginBottom: '10px', display: 'flex', flexDirection: 'column', boxShadow: i === 0 ? '0 5px 15px rgba(255,0,122,0.3)' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 'bold' }}>
                  <span style={{ fontSize: '1.1rem' }}>{i === 0 ? '👑' : `${i + 1}.`} {j.avatar} {j.nombre} {j.pinocho ? '🤥' : ''} {j.puntos >= 30 ? '🔥' : ''}</span>
                  <span style={{ fontSize: '1.1rem' }}>{j.puntos} pts</span>
                </div>
                {j.medalla && (
                  <div style={{ fontSize: '0.8rem', color: i === 0 ? '#FFF' : '#FFD700', marginTop: '8px', fontWeight: 'normal', fontStyle: 'italic' }}>
                    {j.medalla}
                  </div>
                )}
              </div>
            ))}
          </div>

          {infoPartida?.idTest && (
            <p style={{ color: '#A09FB1', fontSize: '0.85rem', marginBottom: '10px', textAlign: 'center' }}>
              Jugaste: {nombrePartida}
            </p>
          )}

          <button style={{ ...estilos.botonPrincipal, maxWidth: '300px' }} onClick={() => { reproducirSonido('click'); localStorage.removeItem('sinCareta_sesion'); window.location.reload(); }}>
            VOLVER A EMPEZAR
          </button>
        </div>
      )}

    </div>
  );
}

export default App;
