export default {
  // ---------------------------------------------------------------- auth
  'auth.required': {
    en: 'You need to sign in',
    es: 'Necesitas iniciar sesión',
  },
  'auth.expired': {
    en: 'Session expired',
    es: 'La sesión ha expirado',
  },
  'auth.invalid': {
    en: 'Invalid session, sign in again',
    es: 'Sesión inválida, vuelve a iniciar sesión',
  },
  'auth.invalidToken': {
    en: 'Invalid token',
    es: 'Token inválido',
  },
  'auth.permissions': {
    en: 'You do not have permission to access this resource',
    es: 'No tienes permiso para acceder a este recurso',
  },
  'auth.user.blocked': {
    en: 'Your account is disabled',
    es: 'Tu cuenta está desactivada',
  },
  'auth.demasiadosIntentos': {
    en: 'Too many failed attempts. Wait a few minutes and try again',
    es: 'Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo',
  },
  'limite.ritmo': {
    en: 'Too many requests. Wait a moment and try again',
    es: 'Demasiadas solicitudes. Espera un momento e inténtalo de nuevo',
  },
  'auth.incorrect.userOrPassword': {
    en: 'Incorrect email or password',
    es: 'Email o contraseña incorrectos',
  },

  // ---------------------------------------------------------------- staff
  'staff.notFound': {
    en: 'Staff member not found',
    es: 'No encontramos a esa persona del equipo',
  },
  'staff.email.exists': {
    en: 'That email is already in use',
    es: 'Ese email ya está en uso',
  },
  'staff.self.deactivate': {
    en: 'You cannot deactivate or demote yourself',
    es: 'No puedes desactivarte ni quitarte el rol de administrador',
  },
  'staff.advisor.notAdvisor': {
    en: 'Clients can only be assigned to an active advisor',
    es: 'Solo se pueden asignar clientes a un asesor activo',
  },
  'staff.systems.notSystems': {
    en: 'Tickets can only be escalated to an active IT staff member',
    es: 'Solo se puede escalar a una persona activa del área de sistemas',
  },

  // ---------------------------------------------------------------- products & plans
  'product.notFound': {
    en: 'Product not found',
    es: 'Producto no encontrado',
  },
  'plan.notFound': {
    en: 'Plan not found',
    es: 'Plan no encontrado',
  },
  'plan.inactive': {
    en: 'That plan is no longer offered',
    es: 'Ese plan ya no está disponible',
  },
  'plan.exists': {
    en: 'That product already has a plan with this tier and billing period',
    es: 'Ese producto ya tiene un plan con ese nivel y ese plazo',
  },
  'plan.wrongProduct': {
    en: 'The plan belongs to a different product',
    es: 'El plan es de otro producto',
  },

  // ---------------------------------------------------------------- clients
  'client.notFound': {
    en: 'Client not found',
    es: 'Cliente no encontrado',
  },
  'client.taxId.exists': {
    en: 'A client with that tax ID already exists',
    es: 'Ya existe un cliente con ese NIT',
  },
  'client.advisorRequired': {
    en: 'Choose the advisor for this client',
    es: 'Elige el asesor de este cliente',
  },
  'client.product.linked': {
    en: 'This client already has an account in that product',
    es: 'Este cliente ya tiene una cuenta en ese producto',
  },
  'client.adminEmailRequired': {
    en: 'Enter the email of the person who will administer the company in the product',
    es: 'Indica el email de quien administrará la empresa en el producto',
  },
  'product.notConnected': {
    en: 'This product is not connected to the ERP yet',
    es: 'Este producto todavía no está conectado con el ERP',
  },
  'product.notProvisioned': {
    en: 'This account has not been created in the product yet',
    es: 'Esta cuenta todavía no está creada en el producto',
  },
  'product.unavailable': {
    en: 'The product did not respond. Try again in a moment',
    es: 'El producto no respondió. Inténtalo de nuevo en un momento',
  },
  'productAdmin.ambiguous': {
    en: 'The company has several administrators: enter the email of the one to reset',
    es: 'La empresa tiene varios administradores: indica el email del que quieres resetear',
  },
  'productAdmin.notFound': {
    en: 'No active administrator with that email in the company',
    es: 'No hay un administrador activo con ese email en la empresa',
  },
  'productAccount.notFound': {
    en: 'Product account not found',
    es: 'Cuenta de producto no encontrada',
  },

  // ---------------------------------------------------------------- subscriptions & payments
  'subscription.notFound': {
    en: 'Subscription not found',
    es: 'Suscripción no encontrada',
  },
  'subscription.exists': {
    en: 'This account already has a subscription that is not canceled',
    es: 'Esta cuenta ya tiene una suscripción sin cancelar',
  },
  'subscription.canceled': {
    en: 'The subscription is canceled',
    es: 'La suscripción está cancelada',
  },
  'payment.notFound': {
    en: 'Payment not found',
    es: 'Pago no encontrado',
  },
  'payment.notPaid': {
    en: 'Only paid payments can be refunded',
    es: 'Solo se puede reembolsar un pago pagado',
  },
  'payment.currency': {
    en: 'The payment currency must match the subscription',
    es: 'La moneda del pago debe ser la de la suscripción',
  },

  // ---------------------------------------------------------------- settlements
  'settlement.notFound': {
    en: 'Settlement not found',
    es: 'Liquidación no encontrada',
  },
  'settlement.notOpen': {
    en: 'Only an open settlement can be closed',
    es: 'Solo se puede cerrar una liquidación abierta',
  },
  'settlement.notClosed': {
    en: 'Close the settlement before marking it paid',
    es: 'Cierra la liquidación antes de marcarla como pagada',
  },

  // ---------------------------------------------------------------- tickets
  'ticket.notFound': {
    en: 'Ticket not found',
    es: 'Ticket no encontrado',
  },
  'ticket.state': {
    en: 'That action is not possible in the current ticket state',
    es: 'Esa acción no es posible en el estado actual del ticket',
  },
};
