/**
 * Entrar, crear cuenta y el nivel de cocina, que se pregunta aqui y no en otro sitio.
 *
 * Un fichero por dominio porque con 600 claves en el service cada retoque habria generado conflictos
 * en todas las tandas a la vez. `as const` no es decoracion: es lo que da el tipo union de claves y, con
 * el `Record<keyof typeof es, string>` del lado ingles, hace que **una traduccion que falte sea un error
 * de compilacion** en lugar de una pantalla medio en espanol.
 */
export const authEs = {
  'auth.al_entrar_te_preguntamos': 'Al entrar te preguntamos cinco cosas cortas: cuánto cocinas, qué quieres llevar desde la app y qué no puedes comer. Se pueden saltar y cambiar luego en Preferencias.',
  'auth.already': '¿Ya tienes cuenta?',
  'auth.beginner': 'Principiante',
  'auth.cookingLevel': 'Nivel de cocina',
  'auth.email': 'Email',
  'auth.enviar_enlace': 'Enviar enlace',
  'auth.expert': 'Experto',
  'auth.forgot': '¿Olvidaste tu contraseña?',
  'auth.inicia_sesion': 'Inicia sesión',
  'auth.intermediate': 'Intermedio',
  'auth.introduce_tu_email_y': 'Introduce tu email y te enviaremos un enlace para restablecer tu contraseña.',
  'auth.login': 'Iniciar sesión',
  'auth.name': 'Nombre',
  'auth.noaccount': '¿No tienes cuenta?',
  'auth.password': 'Contraseña',
  'auth.recuperar_contrasena': 'Recuperar Contraseña',
  'auth.register.cta': 'Crear Cuenta',
  'auth.register': 'Crear cuenta',
  'auth.registrate': 'Regístrate',
  'auth.tu_asistente_de_cocina': 'Tu asistente de cocina inteligente',
  'auth.tu_email_com': 'tu@email.com',
  'auth.tu_nombre': 'Tu nombre',
  'auth.volver_al_login': '← Volver al login',
} as const;

export const authEn: Record<keyof typeof authEs, string> = {
  'auth.al_entrar_te_preguntamos': 'Once you are in we ask five short things: how much you cook, what you want out of the app and what you cannot eat. You can skip them and change everything later in Preferences.',
  'auth.already': 'Already have an account?',
  'auth.beginner': 'Beginner',
  'auth.cookingLevel': 'Cooking level',
  'auth.email': 'Email',
  'auth.enviar_enlace': 'Send link',
  'auth.expert': 'Expert',
  'auth.forgot': 'Forgot password?',
  'auth.inicia_sesion': 'Log in',
  'auth.intermediate': 'Intermediate',
  'auth.introduce_tu_email_y': 'Enter your email and we will send you a link to reset your password.',
  'auth.login': 'Log in',
  'auth.name': 'Name',
  'auth.noaccount': 'Don\'t have an account?',
  'auth.password': 'Password',
  'auth.recuperar_contrasena': 'Reset password',
  'auth.register.cta': 'Create account',
  'auth.register': 'Sign up',
  'auth.registrate': 'Sign up',
  'auth.tu_asistente_de_cocina': 'Your smart cooking assistant',
  'auth.tu_email_com': 'you@email.com',
  'auth.tu_nombre': 'Your name',
  'auth.volver_al_login': '← Back to log in',
};
