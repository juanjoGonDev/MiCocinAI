/**
 * Entrar, crear cuenta y el nivel de cocina, que se pregunta aqui y no en otro sitio.
 *
 * Un fichero por dominio porque con 600 claves en el service cada retoque habria generado conflictos
 * en todas las tandas a la vez. `as const` no es decoracion: es lo que da el tipo union de claves y, con
 * el `Record<keyof typeof es, string>` del lado ingles, hace que **una traduccion que falte sea un error
 * de compilacion** en lugar de una pantalla medio en espanol.
 */
export const authEs = {
  'auth.la_contrasena_debe_tener': 'La contraseña debe tener al menos 6 caracteres',
  'auth.el_nombre_es_requerido': 'El nombre es requerido',
  'auth.la_contrasena_es_requerida': 'La contraseña es requerida',
  'auth.el_email_es_requerido': 'El email es requerido',
  'auth.error_al_crear_la': 'Error al crear la cuenta',
  'auth.tu_cuenta_ha_sido': 'Tu cuenta ha sido creada correctamente',
  'auth.cuenta_creada': '¡Cuenta creada!',
  'auth.credenciales_incorrectas': 'Credenciales incorrectas',
  'auth.has_iniciado_sesion_correctamente': 'Has iniciado sesión correctamente',
  'auth.bienvenido': '¡Bienvenido!',
  'auth.te_has_unido_al': 'Te has unido al hogar',
  'auth.unido': '¡Unido!',
  'auth.si_el_email_existe':
    'Si el email existe, recibirás un enlace para restablecer tu contraseña',
  'auth.email_enviado': 'Email enviado',
  'auth.al_entrar_te_preguntamos':
    'Al entrar te preguntamos cinco cosas cortas: cuánto cocinas, qué quieres llevar desde la app y qué no puedes comer. Se pueden saltar y cambiar luego en Preferencias.',
  'auth.already': '¿Ya tienes cuenta?',
  'auth.beginner': 'Principiante',
  'auth.cookingLevel': 'Nivel de cocina',
  'auth.email': 'Email',
  'auth.enviar_enlace': 'Enviar enlace',
  'auth.expert': 'Experto',
  'auth.forgot': '¿Olvidaste tu contraseña?',
  'auth.inicia_sesion': 'Inicia sesión',
  'auth.intermediate': 'Intermedio',
  'auth.introduce_tu_email_y':
    'Introduce tu email y te enviaremos un enlace para restablecer tu contraseña.',
  'auth.login': 'Iniciar sesión',
  'auth.name': 'Nombre',
  'auth.noaccount': '¿No tienes cuenta?',
  'auth.password': 'Contraseña',
  'auth.recuperar_contrasena': 'Recuperar Contraseña',
  'auth.register.cta': 'Crear Cuenta',
  'auth.register': 'Crear cuenta',
  'auth.registrate': 'Regístrate',
  'auth.tu_asistente_del_hogar': 'Tu asistente para tener la casa a punto',
  'auth.tu_email_com': 'tu@email.com',
  'auth.tu_nombre': 'Tu nombre',
  'auth.volver_al_login': '← Volver al login'
} as const;

export const authEn: Record<keyof typeof authEs, string> = {
  'auth.la_contrasena_debe_tener': 'Password must be at least 6 characters',
  'auth.el_nombre_es_requerido': 'Name is required',
  'auth.la_contrasena_es_requerida': 'Password is required',
  'auth.el_email_es_requerido': 'Email is required',
  'auth.error_al_crear_la': 'Could not create the account',
  'auth.tu_cuenta_ha_sido': 'Your account has been created correctly',
  'auth.cuenta_creada': 'Account created!',
  'auth.credenciales_incorrectas': 'Wrong credentials',
  'auth.has_iniciado_sesion_correctamente': 'You are signed in',
  'auth.bienvenido': 'Welcome!',
  'auth.te_has_unido_al': 'You have joined the household',
  'auth.unido': 'Joined!',
  'auth.si_el_email_existe': 'If the email exists, you will get a link to reset your password',
  'auth.email_enviado': 'Email sent',
  'auth.al_entrar_te_preguntamos':
    'Once you are in we ask five short things: how much you cook, what you want out of the app and what you cannot eat. You can skip them and change everything later in Preferences.',
  'auth.already': 'Already have an account?',
  'auth.beginner': 'Beginner',
  'auth.cookingLevel': 'Cooking level',
  'auth.email': 'Email',
  'auth.enviar_enlace': 'Send link',
  'auth.expert': 'Expert',
  'auth.forgot': 'Forgot password?',
  'auth.inicia_sesion': 'Log in',
  'auth.intermediate': 'Intermediate',
  'auth.introduce_tu_email_y':
    'Enter your email and we will send you a link to reset your password.',
  'auth.login': 'Log in',
  'auth.name': 'Name',
  'auth.noaccount': "Don't have an account?",
  'auth.password': 'Password',
  'auth.recuperar_contrasena': 'Reset password',
  'auth.register.cta': 'Create account',
  'auth.register': 'Sign up',
  'auth.registrate': 'Sign up',
  'auth.tu_asistente_del_hogar': 'Your assistant for keeping the home in order',
  'auth.tu_email_com': 'you@email.com',
  'auth.tu_nombre': 'Your name',
  'auth.volver_al_login': '← Back to log in'
};
