declare const __APP_COMMIT__: string;

/** Versão do sistema (aumenta a cada atualização entregue). */
export const APP_VERSION = '10.0';
export const APP_COMMIT = typeof __APP_COMMIT__ === 'string' ? __APP_COMMIT__ : '';
