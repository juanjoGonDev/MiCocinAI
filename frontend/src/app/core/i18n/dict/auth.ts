/**
 * Entrar, crear cuenta y el nivel de cocina, que se pregunta aqui y no en otro sitio.
 *
 * Un fichero por dominio porque con 600 claves en el service cada retoque habria generado conflictos
 * en todas las tandas a la vez. `as const` no es decoracion: es lo que da el tipo union de claves y, con
 * el `Record<keyof typeof es, string>` del lado ingles, hace que **una traduccion que falte sea un error
 * de compilacion** en lugar de una pantalla medio en espanol.
 */
export const authEs = {
  'auth.already': '¿Ya tienes cuenta?',
  'auth.beginner': 'Principiante',
  'auth.cookingLevel': 'Nivel de cocina',
  'auth.email': 'Email',
  'auth.expert': 'Experto',
  'auth.forgot': '¿Olvidaste la contraseña?',
  'auth.intermediate': 'Intermedio',
  'auth.login': 'Iniciar sesión',
  'auth.login.cta': 'Entrar',
  'auth.name': 'Nombre',
  'auth.noaccount': '¿No tienes cuenta?',
  'auth.password': 'Contraseña',
  'auth.register': 'Crear cuenta',
  'auth.register.cta': 'Crear Cuenta',
} as const;

export const authEn: Record<keyof typeof authEs, string> = {
  'auth.already': 'Already have an account?',
  'auth.beginner': 'Beginner',
  'auth.cookingLevel': 'Cooking level',
  'auth.email': 'Email',
  'auth.expert': 'Expert',
  'auth.forgot': 'Forgot password?',
  'auth.intermediate': 'Intermediate',
  'auth.login': 'Log in',
  'auth.login.cta': 'Sign in',
  'auth.name': 'Name',
  'auth.noaccount': 'Don\'t have an account?',
  'auth.password': 'Password',
  'auth.register': 'Sign up',
  'auth.register.cta': 'Create account',
};
