'use client';

type Props = {
  onSignOut: () => Promise<void>;
};

const SignOut = ({ onSignOut }: Props) => {
  return (
    <button
      onClick={() => {
        onSignOut();
      }}
      className="hover:text-gray-300"
    >
      Sign Out
    </button>
  );
};

export default SignOut;
