import type { CardValue, Color } from "../utilities/constants";

interface cardProps {
  color: Color;
  value: CardValue;
}

const Card = ({ color, value }: cardProps) => {
  const colorClass =
    color === "red"
      ? "bg-red-500 text-white"
      : color === "yellow"
        ? "bg-yellow-400 text-black"
        : color === "green"
          ? "bg-green-500 text-white"
          : color === "blue"
            ? "bg-blue-500 text-white"
            : "bg-gradient-to-br from-red-500 via-yellow-400 to-blue-500 text-white";

  return (
    <div
      className={`h-24 w-16 rounded-lg border-2 border-black/20 shadow-sm ${colorClass}`}
    >
      <div className="flex h-full items-center justify-center text-lg font-bold">
        {value}
      </div>
    </div>
  );
};

export default Card;
