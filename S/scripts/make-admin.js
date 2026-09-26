const { getUserByUsername, updateUserRole } = require('../database');

async function main() {
  const username = process.argv[2]?.trim();

  if (!username) {
    console.error('Uso: node scripts/make-admin.js <username>');
    process.exit(1);
  }

  const user = await getUserByUsername(username);

  if (!user) {
    console.error(`No existe ningún usuario con el nombre "${username}".`);
    process.exit(1);
  }

  await updateUserRole(user.id, 'admin');
  console.log(`Usuario "${username}" actualizado a administrador.`);
}

main().catch((error) => {
  console.error('Error al convertir el usuario en administrador:', error);
  process.exit(1);
});
