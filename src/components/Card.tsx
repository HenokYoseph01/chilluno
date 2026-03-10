import type { CardValue, Color } from "../utilities/constants";

interface cardProps {
  color: Color;
  value: CardValue;
}

const Card = ({ color, value }: cardProps) => {
  return (
    <div className="border-2">
      {color}, {value}
    </div>
  );
};

export default Card;
