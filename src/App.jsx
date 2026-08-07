import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';

// Cambia esta URL según el puerto/host de tu servidor Node.js
const socket = io('http://localhost:3001');

export default function App() {
  const [pantalla, setPantalla] = useState('INICIO'); // INICIO, SALA, REGLAS, JUEGO, INTERMEDIO, PODIO
  const [nombreUsuario, setNombreUsuario] = useState('');
  const [avatar, setAvatar] = useState('🦊');
  const [codigoSalaInput, setCodigoSalaInput] = useState('');
  
  const [miSala, setMiSala] = useState('');
  const [miId, setMiId] = useState('');
  const [jugadores, setJugadores] = useState([]);
  
  const [preguntaActual, setPreguntaActual] = useState(null);
  const [opcionSeleccionada, setOpcionSeleccionada] = useState(null);
  
  // Voto Traidor
  const [traidorObjetivo, setTraidorObjetivo] = useState('');
  const [traidorOpcion, setTraidorOpcion] = useState('');

  const [revelacion, setRevelacion] = useState(null);

  useEffect(() => {
    socket.on('connect', () => {
      setMiId(socket.id);
    });

    socket.on('sala_creada', (data) => {
      setMiSala(data.codigoSala);
      setJugadores(data.jugadores);
      setPantalla('SALA');
    });

    socket.on('actualizar_jugadores', (data) => {
      setJugadores(data.jugadores);
    });

    socket.on('pantalla_reglas', () => {
      setPantalla('REGLAS');
    });

    socket.on('nueva_pregunta', (data) => {
      setPreguntaActual(data.pregunta);
      setOpcionSeleccionada(null);
      setTraidorObjetivo('');
      setTraidorOpcion('');
      setRevelacion(null);
      setPantalla('JUEGO');
    });

    socket.on('mostrar_revelacion', (data) => {
      setRevelacion(data.revelacion);
      setJugadores(data.jugadores);
      setPantalla('INTERMEDIO');
    });

    socket.on('juego_terminado', (data) => {
      setJugadores(data.jugadores);
      setPantalla('PODIO');
    });

    return () => {
      socket.off('sala_creada');
      socket.off('actualizar_jugadores');
      socket.off('pantalla_reglas');
      socket.off('nueva_pregunta');
      socket.off('mostrar_revelacion');
      socket.off('juego_terminado');
    };
  }, []);

  const crearSala = () => {
    if (!nombreUsuario) return alert('Ingresá tu nombre');
    socket.emit('crear_sala', { nombreUsuario, avatar });
  };

  const unirseSala = () => {
    if (!nombreUsuario || !codigoSalaInput) return alert('Ingresá nombre y código');
    socket.emit('unirse_sala', { codigoSala: codigoSalaInput.toUpperCase(), nombreUsuario, avatar });
    setMiSala(codigoSalaInput.toUpperCase());
    setPantalla('SALA');
  };

  const prepararJuego = () => {
    // Por defecto inicia Test 1, Parte 1
    socket.emit('preparar_juego', { codigoSala: miSala, idTest: 1, parte: 1 });
  };

  const iniciarJuego = () => {
    socket.emit('iniciar_juego', { codigoSala: miSala });
  };

  const responder = (idOpcion) => {
    setOpcionSeleccionada(idOpcion);
    
    let prediccion = null;
    if (traidorObjetivo && traidorOpcion) {
      prediccion = {
        jugadorObjetivoId: traidorObjetivo,
        opcionAdivinadaId: traidorOpcion
      };
    }

    socket.emit('enviar_respuesta', {
      codigoSala: miSala,
      idOpcion,
      prediccion
    });
  };

  const esAnfitrion = jugadores.find(j => j.id === socket.id || j.id === miId)?.esAnfitrion;

  // --- ESTILOS DE INTERFAZ ---
  const estilos = {
    contenedor: {
      minHeight: '100vh',
      backgroundColor: '#0d0714',
      color: '#ffffff',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    },
    tarjetaGlass: {
      background: 'rgba(255, 255, 255, 0.05)',
      backdropFilter: 'blur(10px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '24px',
      padding: '30px',
      width: '100%',
      maxWidth: '500px',
      boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
      textAlign: 'center'
    },
    botonPrincipal: {
      background: 'linear-gradient(90deg, #FF007A 0%, #7E00FF 100%)',
      border: 'none',
      color: '#fff',
      padding: '16px 24px',
      borderRadius: '50px',
      fontSize: '1.1rem',
      fontWeight: '800',
      cursor: 'pointer',
      width: '100%',
      marginTop: '15px',
      boxShadow: '0 0 15px rgba(255, 0, 122, 0.4)'
    },
    input: {
      width: '100%',
      padding: '14px',
      borderRadius: '12px',
      border: '1px solid rgba(255,255,255,0.2)',
      background: 'rgba(0,0,0,0.4)',
      color: '#fff',
      fontSize: '1rem',
      marginBottom: '12px',
      boxSizing: 'border-box'
    },
    badgeRonda: {
      background: 'rgba(255, 255, 255, 0.1)',
      padding: '6px 16px',
      borderRadius: '20px',
      fontSize: '0.85rem',
      fontWeight: '600',
      color: '#00FFA3',
      display: 'inline-block',
      marginBottom: '15px'
    }
  };

  return (
    <div style={estilos.contenedor}>
      <h1 style={{ color: '#00FFA3', fontSize: '1.4rem', textTransform: 'uppercase', tracking: '2px', marginBottom: '20px' }}>
        El Simulador de Destrucción de Amistades
      </h1>

      {/* 1. PANTALLA INICIO */}
      {pantalla === 'INICIO' && (
        <div style={estilos.tarjetaGlass}>
          <h2 style={{ marginBottom: '20px' }}>Crear o Unirse</h2>
          
          <input 
            style={estilos.input} 
            placeholder="Tu Nombre / Apodo" 
            value={nombreUsuario} 
            onChange={(e) => setNombreUsuario(e.target.value)} 
          />
          
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '15px' }}>
            {['🦊', '🐱', '🐭', '🦥', '🐻'].map(emoji => (
              <button 
                key={emoji} 
                onClick={() => setAvatar(emoji)} 
                style={{ 
                  background: avatar === emoji ? 'rgba(0, 255, 163, 0.2)' : 'transparent', 
                  border: avatar === emoji ? '2px solid #00FFA3' : '1px solid rgba(255,255,255,0.1)', 
                  borderRadius: '12px', 
                  fontSize: '1.5rem', 
                  padding: '8px', 
                  cursor: 'pointer' 
                }}
              >
                {emoji}
              </button>
            ))}
          </div>

          <button style={estilos.botonPrincipal} onClick={crearSala}>CREAR SALA</button>

          <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)', margin: '20px 0' }} />

          <input 
            style={estilos.input} 
            placeholder="CÓDIGO DE SALA" 
            value={codigoSalaInput} 
            onChange={(e) => setCodigoSalaInput(e.target.value)} 
          />
          <button style={{ ...estilos.botonPrincipal, background: '#2A293E' }} onClick={unirseSala}>UNIRSE A SALA</button>
        </div>
      )}

      {/* 2. PANTALLA SALA DE ESPERA */}
      {pantalla === 'SALA' && (
        <div style={estilos.tarjetaGlass}>
          <h2>SALA: <span style={{ color: '#00FFA3' }}>{miSala}</span></h2>
          <p style={{ color: '#A09FB1', marginBottom: '20px' }}>Jugadores conectados:</p>
          
          <div style={{ marginBottom: '20px' }}>
            {jugadores.map((j) => (
              <div key={j.id} style={{ background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '8px', marginBottom: '8px' }}>
                {j.avatar} {j.nombre} {j.esAnfitrion ? '👑' : ''}
              </div>
            ))}
          </div>

          {esAnfitrion ? (
            <button style={estilos.botonPrincipal} onClick={prepararJuego}>PREPARAR JUEGO</button>
          ) : (
            <p style={{ color: '#A09FB1' }}>Esperando que el anfitrión comience...</p>
          )}
        </div>
      )}

      {/* 3. PANTALLA REGLAS */}
      {pantalla === 'REGLAS' && (
        <div style={estilos.tarjetaGlass}>
          <h2>Reglas de Juego</h2>
          <p style={{ textAlign: 'left', lineHeight: '1.5', color: '#D0CFE5', marginBottom: '20px' }}>
            1. Respondé honestamente a las preguntas.<br/>
            2. Intentá predecir qué van a responder tus amigos con el <b>Voto Traidor</b>.<br/>
            3. En las rondas de <b>Fuego Cruzado</b>, votás directamente a quién le cae la ficha del grupo.
          </p>
          {esAnfitrion ? (
            <button style={estilos.botonPrincipal} onClick={iniciarJuego}>¡EMPEZAR AHORA!</button>
          ) : (
            <p style={{ color: '#A09FB1' }}>Esperando que el anfitrión inicie...</p>
          )}
        </div>
      )}

      {/* 4. PANTALLA DE PREGUNTA / JUEGO */}
      {pantalla === 'JUEGO' && preguntaActual && (
        <div style={estilos.tarjetaGlass}>
          
          {/* Muestra la ronda real enviada por el servidor */}
          <div style={estilos.badgeRonda}>
            Ronda {preguntaActual.numero} de {preguntaActual.total}
          </div>

          <h2 style={{ fontSize: '1.2rem', marginBottom: '20px', lineHeight: '1.4' }}>
            {preguntaActual.texto}
          </h2>

          {/* CAJA DE VOTO TRAIDOR (solo si NO es Fuego Cruzado) */}
          {!preguntaActual.es_fuego_cruzado && (
            <div style={{ background: 'rgba(126, 0, 255, 0.15)', border: '1px solid #7E00FF', borderRadius: '16px', padding: '15px', marginBottom: '20px' }}>
              <div style={{ color: '#00FFA3', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '10px' }}>
                🕵️ VOTO TRAIDOR (Optativo: Acertá y restá 2 pts)
              </div>
              
              <select 
                style={estilos.input} 
                value={traidorObjetivo} 
                onChange={(e) => setTraidorObjetivo(e.target.value)}
              >
                <option value="">¿Quién va a mentir?</option>
                {jugadores.filter(j => j.id !== miId).map(j => (
                  <option key={j.id} value={j.id}>{j.avatar} {j.nombre}</option>
                ))}
              </select>

              <select 
                style={estilos.input} 
                value={traidorOpcion} 
                onChange={(e) => setTraidorOpcion(e.target.value)}
              >
                <option value="">¿Qué va a responder?</option>
                {/* MUESTRA SOLAMENTE LA LETRA CORRESPONDIENTE DE CADA OPCIÓN */}
                {preguntaActual.opciones?.map((opc, idx) => {
                  const letra = String.fromCharCode(65 + idx);
                  return (
                    <option key={opc.id_opcion || idx} value={opc.id_opcion}>
                      Opción {letra}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {/* OPCIONES DE RESPUESTA */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {preguntaActual.es_fuego_cruzado ? (
              // Fuego Cruzado: Seleccionar un jugador
              jugadores.filter(j => j.id !== miId).map(j => (
                <button
                  key={j.id}
                  disabled={opcionSeleccionada !== null}
                  onClick={() => responder(j.id)}
                  style={{
                    ...estilos.input,
                    cursor: 'pointer',
                    background: opcionSeleccionada === j.id ? '#00FFA3' : 'rgba(255,255,255,0.08)',
                    color: opcionSeleccionada === j.id ? '#000' : '#fff',
                    fontWeight: 'bold'
                  }}
                >
                  {j.avatar} {j.nombre}
                </button>
              ))
            ) : (
              // Pregunta Normal: Opciones A, B, C, D...
              preguntaActual.opciones?.map((opc, idx) => {
                const letra = String.fromCharCode(65 + idx);
                const seleccionada = opcionSeleccionada === opc.id_opcion;
                return (
                  <button
                    key={opc.id_opcion || idx}
                    disabled={opcionSeleccionada !== null}
                    onClick={() => responder(opc.id_opcion)}
                    style={{
                      padding: '12px',
                      borderRadius: '12px',
                      border: '1px solid rgba(255,255,255,0.1)',
                      background: seleccionada ? '#00FFA3' : 'rgba(255,255,255,0.05)',
                      color: seleccionada ? '#000' : '#fff',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontWeight: '500'
                    }}
                  >
                    <b style={{ color: seleccionada ? '#000' : '#FF007A', marginRight: '8px' }}>{letra})</b> {opc.texto}
                  </button>
                );
              })
            )}
          </div>

          {opcionSeleccionada && (
            <p style={{ color: '#00FFA3', marginTop: '15px', fontSize: '0.9rem' }}>
              ✓ Respuesta enviada. Esperando al resto...
            </p>
          )}
        </div>
      )}

      {/* 5. INTERMEDIO / FIN DE RONDA (TABLA DE TOXICIDAD) */}
      {pantalla === 'INTERMEDIO' && (
        <div style={estilos.tarjetaGlass}>
          <h2 style={{ color: '#00FFA3', marginBottom: '20px', fontWeight: '800' }}>Fin de la Ronda</h2>
          
          <div style={{ width: '100%', marginBottom: '25px' }}>
            <h3 style={{ color: '#A09FB1', fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: '15px' }}>
              Tabla de Toxicidad:
            </h3>

            {/* TABLA ORDENADA DE MAYOR A MENOR PUNTAJE */}
            {[...jugadores]
              .sort((a, b) => b.puntos - a.puntos)
              .map((j) => (
                <div 
                  key={j.id} 
                  style={{ 
                    background: 'rgba(0,0,0,0.3)', 
                    padding: '12px 15px', 
                    borderRadius: '8px', 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    marginBottom: '8px' 
                  }}
                >
                  <span style={{ fontWeight: '600' }}>
                    {j.avatar} {j.nombre} {j.pinocho ? '🤥' : ''}
                  </span>
                  <span style={{ color: '#00FFA3', fontWeight: '800' }}>
                    {j.puntos} pts
                  </span>
                </div>
              ))}
          </div>

          {esAnfitrion ? (
            <button 
              style={estilos.botonPrincipal} 
              onClick={() => socket.emit('siguiente_pregunta', { codigoSala: miSala })}
            >
              SIGUIENTE PREGUNTA
            </button>
          ) : (
            <p style={{ color: '#A09FB1' }}>Esperando que el anfitrión avance...</p>
          )}
        </div>
      )}

      {/* 6. PANTALLA PODIO / FIN DEL JUEGO */}
      {pantalla === 'PODIO' && (
        <div style={estilos.tarjetaGlass}>
          <h2 style={{ color: '#FF007A', marginBottom: '10px' }}>¡Juego Terminado!</h2>
          <p style={{ color: '#A09FB1', marginBottom: '20px' }}>Resultados Finales & Medallas</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
            {[...jugadores]
              .sort((a, b) => b.puntos - a.puntos)
              .map((j, index) => (
                <div key={j.id} style={{ background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '12px', textAlign: 'left' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                    <span>#{index + 1} {j.avatar} {j.nombre}</span>
                    <span style={{ color: '#00FFA3' }}>{j.puntos} pts</span>
                  </div>
                  {j.medalla && (
                    <div style={{ color: '#FF007A', fontSize: '0.85rem', marginTop: '6px', fontWeight: '600' }}>
                      {j.medalla}
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

    </div>
  );
}
